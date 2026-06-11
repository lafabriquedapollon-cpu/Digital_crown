from fastapi import APIRouter, Depends, HTTPException, Body, Path
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Dict, Any, Optional, List
import logging
from backend.services.security.data_sanitizer import data_sanitizer

from backend.database import get_db
from backend import models
from backend.routers.auth import get_current_user
from backend.services.bot.intent_parser import intent_parser as regex_parser
from backend.services.bot.llm_parser import llm_parser
from backend.services.bot.action_dispatcher import ActionDispatcher

router = APIRouter(tags=["bot"])
logger = logging.getLogger(__name__)

# On utilise le SLM Parser par défaut, qui bascule (fallback) 
# sur le regex_parser en cas d'erreur ou timeout.
parser = llm_parser
dispatcher = ActionDispatcher()

@router.get("/sessions")
async def get_sessions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Récupère la liste des sessions actives (non archivées) de l'utilisateur.
    """
    employer_id = current_user.get_employer_id()
    sessions = db.query(models.BotSession).filter(
        models.BotSession.employer_id == employer_id,
        models.BotSession.is_archived == False
    ).order_by(desc(models.BotSession.updated_at)).all()
    
    return [
        {
            "id": s.id,
            "title": s.title,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None
        }
        for s in sessions
    ]

@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Récupère l'historique complet des messages d'une session.
    """
    employer_id = current_user.get_employer_id()
    session = db.query(models.BotSession).filter(
        models.BotSession.id == session_id,
        models.BotSession.employer_id == employer_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
        
    messages = db.query(models.BotMessage).filter(
        models.BotMessage.session_id == session_id
    ).order_by(models.BotMessage.created_at).all()
    
    return [
        {
            "id": m.id,
            "sender": m.sender,
            "text": m.text,
            "actionType": m.raw_data.get("action_type") if m.raw_data else None,
            "pendingAction": m.raw_data.get("pending_action") if m.raw_data else None,
            "suggestions": m.raw_data.get("suggestions", []) if m.raw_data else [],
            "createdAt": m.created_at.isoformat() if m.created_at else None
        }
        for m in messages
    ]

@router.delete("/sessions/{session_id}")
async def archive_session(
    session_id: str = Path(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Archive (soft delete) une session.
    """
    employer_id = current_user.get_employer_id()
    session = db.query(models.BotSession).filter(
        models.BotSession.id == session_id,
        models.BotSession.employer_id == employer_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")
        
    session.is_archived = True
    db.commit()
    
    return {"status": "success", "message": "Session archivée"}

@router.post("/chat")
async def bot_chat(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Point d'entrée de l'assistant Crown Bot avec gestion des sessions.
    """
    message = payload.get("message", "").strip()
    session_id = payload.get("session_id")
    
    if not message:
        raise HTTPException(status_code=400, detail="Message vide")

    employer_id = current_user.get_employer_id()

    # Gestion de la session
    if not session_id:
        # Créer une nouvelle session
        title_words = message.split()[:5]
        title = " ".join(title_words) + ("..." if len(message.split()) > 5 else "")
        bot_session = models.BotSession(
            employer_id=employer_id,
            title=title
        )
        db.add(bot_session)
        db.commit()
        db.refresh(bot_session)
        session_id = bot_session.id
    else:
        # Vérifier que la session existe et appartient à l'utilisateur
        bot_session = db.query(models.BotSession).filter(
            models.BotSession.id == session_id,
            models.BotSession.employer_id == employer_id
        ).first()
        if not bot_session:
            raise HTTPException(status_code=404, detail="Session introuvable")
        # Update updated_at
        bot_session.updated_at = __import__('datetime').datetime.now()

    # 1. Sauvegarder le message de l'utilisateur
    user_msg = models.BotMessage(
        session_id=session_id,
        sender="user",
        text=message
    )
    db.add(user_msg)
    db.commit()

    # 2. Construire la fenêtre de contexte conversationnel (4 derniers messages)
    #    Les réponses bot sont sanitizées avant d'être passées au LLM.
    recent_msgs = (
        db.query(models.BotMessage)
        .filter(models.BotMessage.session_id == session_id)
        .order_by(desc(models.BotMessage.created_at))
        .limit(4)
        .all()
    )
    context_window = [
        {
            "role": m.sender,
            "content": data_sanitizer.sanitize_bot_response(m.text) if m.sender == "bot" else m.text,
        }
        for m in reversed(recent_msgs)
    ]

    # 3. Regex First (Ultra Rapide)
    parsed_intent = regex_parser.parse(message, context=context_window)

    # 4. Si le regex n'est pas confiant, on essaye le LLM avec le contexte
    if parsed_intent.confidence < 0.85 and parsed_intent.intent == "UNKNOWN":
        logger.info("Regex non confiant, appel au LLM avec contexte...")
        parsed_intent = parser.parse(message, context=context_window)

    # 5. Dispatch Action
    response = dispatcher.dispatch(parsed_intent, db, current_user)
    
    # Récupération des données brutes
    response_dict = response.to_dict()
    
    # 4. Sauvegarder la réponse du bot
    bot_msg = models.BotMessage(
        session_id=session_id,
        sender="bot",
        text=response_dict.get("message", ""),
        raw_data={
            "action_type": response_dict.get("action_type"),
            "pending_action": response_dict.get("pending_action"),
            "suggestions": response_dict.get("suggestions", [])
        }
    )
    db.add(bot_msg)
    db.commit()

    # On ajoute le session_id à la réponse pour que le front puisse s'y attacher
    response_dict["session_id"] = session_id

    return response_dict

@router.post("/execute")
async def bot_execute(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Exécute une action en attente (pending_action) après confirmation utilisateur.
    """
    pending_action = payload.get("pending_action")
    if not pending_action:
        raise HTTPException(status_code=400, detail="pending_action manquant")

    response = dispatcher.execute(pending_action, db, current_user)
    return response.to_dict()
