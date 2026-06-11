"""
Crown Bot — Action Dispatcher

Mappe chaque ParsedIntent vers le service backend approprié,
exécute l'action, et retourne un résultat structuré.

Toute action d'écriture retourne un `pending_action` que le frontend
doit confirmer avant exécution.
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from backend import models, database
from backend.services.bot.intent_parser import ParsedIntent

logger = logging.getLogger(__name__)


class BotResponse:
    """Réponse structurée du bot."""

    def __init__(
        self,
        message: str,
        data: Optional[Dict[str, Any]] = None,
        action_type: Optional[str] = None,
        pending_action: Optional[Dict[str, Any]] = None,
        suggestions: Optional[List[str]] = None,
    ):
        self.message = message
        self.data = data or {}
        self.action_type = action_type  # "read" | "write_pending" | "info"
        self.pending_action = pending_action  # Action en attente de confirmation
        self.suggestions = suggestions or []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "message": self.message,
            "data": self.data,
            "action_type": self.action_type or "info",
            "pending_action": self.pending_action,
            "suggestions": self.suggestions,
        }


class ActionDispatcher:
    """Exécute les intents en appelant les services existants."""

    def execute(
        self, pending_action: Dict[str, Any], db: Session, user: models.User
    ) -> BotResponse:
        """Exécute une pending_action confirmée par l'utilisateur."""
        action_type = pending_action.get("type")
        params = pending_action.get("params", {})

        executors = {
            "CREATE_APPOINTMENT": self._exec_create_appointment,
            "OPEN_PRESCRIPTION_EDITOR": self._exec_open_prescription,
            "OPEN_DEVIS_EDITOR": self._exec_open_devis,
        }
        fn = executors.get(action_type)
        if not fn:
            return BotResponse(
                message=f"Type d'action inconnu : {action_type}",
                action_type="error",
            )
        try:
            return fn(params, db, user)
        except Exception as e:
            logger.exception("Erreur execute action=%s: %s", action_type, e)
            return BotResponse(
                message=f"Erreur lors de l'exécution : {e}",
                action_type="error",
            )

    def _exec_create_appointment(
        self, params: Dict[str, Any], db: Session, user: models.User
    ) -> BotResponse:
        """Crée réellement le rendez-vous en base."""
        from datetime import datetime as dt

        patient_id = params.get("patient_id")
        patient_name = params.get("patient_name", "")
        datetime_str = params.get("datetime_start")
        motif = params.get("motif", "Consultation")
        duration = params.get("duration_minutes", 30)
        employer_id = user.get_employer_id()

        # Résoudre patient_id si absent
        if not patient_id and patient_name:
            patient = db.query(models.Patient).filter(
                models.Patient.employer_id == employer_id,
                or_(
                    func.concat(models.Patient.prenom, " ", models.Patient.nom).ilike(f"%{patient_name}%"),
                    func.concat(models.Patient.nom, " ", models.Patient.prenom).ilike(f"%{patient_name}%"),
                )
            ).first()
            if patient:
                patient_id = patient.id
                patient_name = f"{patient.prenom} {patient.nom}"

        if not datetime_str:
            return BotResponse(
                message="Date et heure manquantes pour créer le rendez-vous.",
                action_type="error",
            )

        try:
            datetime_start = dt.fromisoformat(datetime_str)
        except ValueError:
            return BotResponse(
                message=f"Format de date invalide : {datetime_str}",
                action_type="error",
            )

        appt = models.Appointment(
            patient_id=patient_id,
            patient_name=patient_name if not patient_id else None,
            datetime_start=datetime_start,
            duration_minutes=duration,
            motif=motif,
            employer_id=employer_id,
        )
        db.add(appt)
        db.commit()
        db.refresh(appt)

        date_label = datetime_start.strftime("%d/%m/%Y à %Hh%M")
        return BotResponse(
            message=(
                f"✅ **Rendez-vous créé !**\n"
                f"👤 {patient_name or 'Patient à identifier'}\n"
                f"📅 {date_label} · {duration} min · {motif}"
            ),
            data={"appointment_id": appt.id},
            action_type="write_done",
            suggestions=["Agenda d'aujourd'hui", "Créer un autre RDV"],
        )

    def _exec_open_prescription(
        self, params: Dict[str, Any], db: Session, user: models.User
    ) -> BotResponse:
        """Retourne un redirect_url pour ouvrir l'éditeur d'ordonnance."""
        patient_id = params.get("patient_id")
        procedure = params.get("procedure", "")
        url = f"/bibliotheque?mode=prescription&patient_id={patient_id}"
        if procedure:
            url += f"&procedure={procedure}"
        return BotResponse(
            message="✅ Ouverture de l'éditeur d'ordonnance...",
            data={"redirect_url": url},
            action_type="redirect",
        )

    def _exec_open_devis(
        self, params: Dict[str, Any], db: Session, user: models.User
    ) -> BotResponse:
        """Retourne un redirect_url pour ouvrir le module devis."""
        patient_id = params.get("patient_id")
        url = f"/patients/{patient_id}?tab=devis"
        return BotResponse(
            message="✅ Ouverture du module devis...",
            data={"redirect_url": url},
            action_type="redirect",
        )

    def dispatch(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        """Route l'intent vers le bon handler."""
        if parsed.needs_clarification:
            return BotResponse(
                message=parsed.clarification_prompt,
                action_type="clarification",
                suggestions=self._contextual_suggestions(parsed.intent),
            )

        handler_map = {
            "QUERY_PATIENT": self._handle_query_patient,
            "QUERY_AGENDA": self._handle_query_agenda,
            "QUERY_FINANCE": self._handle_query_finance,
            "QUERY_LAB": self._handle_query_lab,
            "QUERY_STATS": self._handle_query_stats,
            "QUERY_ALERTS": self._handle_query_alerts,
            "CREATE_APPOINTMENT": self._handle_create_appointment,
            "CREATE_PRESCRIPTION": self._handle_create_prescription,
            "CREATE_DEVIS": self._handle_create_devis,
            "SEARCH_PATIENT": self._handle_search_patient,
            "CHANGE_STATUS": self._handle_change_status,
            "QUERY_KNOWLEDGE": self._handle_query_knowledge,
            "HELP": self._handle_help,
            "GREETING": self._handle_greeting,
        }

        handler = handler_map.get(parsed.intent, self._handle_unknown)
        try:
            return handler(parsed, db, user)
        except Exception as e:
            logger.exception(f"Erreur dispatch intent={parsed.intent}: {e}")
            return BotResponse(
                message=f"Une erreur est survenue : {str(e)}",
                action_type="error",
            )

    # ── QUERY HANDLERS ──────────────────────────────────────────────────────

    def _handle_query_patient(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        employer_id = user.get_employer_id()
        patient = None

        if "patient_id" in parsed.entities:
            patient = db.query(models.Patient).filter(
                models.Patient.id == parsed.entities["patient_id"],
                models.Patient.employer_id == employer_id,
            ).first()
        elif "patient_name" in parsed.entities:
            name = parsed.entities["patient_name"]
            patient = db.query(models.Patient).filter(
                models.Patient.employer_id == employer_id,
                or_(
                    models.Patient.nom.ilike(f"%{name}%"),
                    models.Patient.prenom.ilike(f"%{name}%"),
                    func.concat(models.Patient.prenom, " ", models.Patient.nom).ilike(f"%{name}%"),
                    func.concat(models.Patient.nom, " ", models.Patient.prenom).ilike(f"%{name}%"),
                )
            ).first()

        if not patient:
            return BotResponse(
                message="Patient introuvable. Vérifiez le nom ou l'identifiant.",
                action_type="read",
                suggestions=["Cherche un patient", "Liste des patients"],
            )

        # Construire le résumé patient
        age = ""
        if patient.date_naissance:
            from datetime import date
            today = date.today()
            age_val = today.year - patient.date_naissance.year - (
                (today.month, today.day) < (patient.date_naissance.month, patient.date_naissance.day)
            )
            age = f"{age_val} ans"

        # Nombre d'actes
        acts_count = db.query(func.count(models.Acte.id)).filter(
            models.Acte.patient_id == patient.id
        ).scalar() or 0

        # Solde impayé
        dette = db.query(func.sum(models.Acte.montant)).filter(
            models.Acte.patient_id == patient.id,
            models.Acte.statut_paiement == "EN_ATTENTE"
        ).scalar() or 0.0

        # Prochain RDV
        next_appt = db.query(models.Appointment).filter(
            models.Appointment.patient_id == patient.id,
            models.Appointment.datetime_start > datetime.now(),
            models.Appointment.status != "ANNULÉ"
        ).order_by(models.Appointment.datetime_start).first()

        next_appt_str = "Aucun"
        if next_appt:
            next_appt_str = next_appt.datetime_start.strftime("%d/%m/%Y à %Hh%M")

        data = {
            "patient_id": patient.id,
            "nom": patient.nom,
            "prenom": patient.prenom,
            "age": age,
            "telephone": patient.telephone or "—",
            "assurance": patient.assurance or "Aucune",
            "antecedents": patient.antecedents_medicaux or "Aucun",
            "actes_count": acts_count,
            "dette": round(float(dette), 2),
            "prochain_rdv": next_appt_str,
        }

        message = (
            f"**{patient.prenom} {patient.nom}** ({age})\n"
            f"📱 {data['telephone']} · 🏥 {data['assurance']}\n"
            f"📋 {acts_count} actes · 💰 {round(float(dette))} MAD d'impayé\n"
            f"📅 Prochain RDV : {next_appt_str}"
        )

        if patient.antecedents_medicaux:
            message += f"\n⚠️ Antécédents : {patient.antecedents_medicaux}"

        return BotResponse(
            message=message,
            data=data,
            action_type="read",
            suggestions=[
                f"Ordonnance pour patient {patient.id}",
                f"RDV de patient {patient.id}",
                f"Devis pour patient {patient.id}",
            ],
        )

    def _handle_query_agenda(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        employer_id = user.get_employer_id()
        target = parsed.entities.get("target_date")
        if target:
            target_date = datetime.fromisoformat(target).date()
        else:
            target_date = datetime.now().date()

        day_start = datetime.combine(target_date, datetime.min.time())
        day_end = datetime.combine(target_date, datetime.max.time())

        appts = db.query(models.Appointment).filter(
            models.Appointment.employer_id == employer_id,
            models.Appointment.datetime_start >= day_start,
            models.Appointment.datetime_start <= day_end,
        ).order_by(models.Appointment.datetime_start).all()

        date_label = target_date.strftime("%A %d %B %Y").capitalize()

        if not appts:
            return BotResponse(
                message=f"📅 **{date_label}** — Aucun rendez-vous.",
                action_type="read",
                suggestions=["Agenda de demain", "Prends un RDV"],
            )

        lines = [f"📅 **{date_label}** — {len(appts)} RDV\n"]
        for a in appts:
            time_str = a.datetime_start.strftime("%H:%M")
            patient_name = "—"
            if a.patient_id:
                p = db.query(models.Patient).filter(models.Patient.id == a.patient_id).first()
                if p:
                    patient_name = f"{p.prenom} {p.nom}"
            status_emoji = {"PLANIFIE": "⏳", "EN_COURS": "▶️", "TERMINE": "✅", "ANNULE": "❌"}.get(a.status, "⏳")
            lines.append(f"{status_emoji} **{time_str}** · {patient_name} · {a.motif or '—'}")

        return BotResponse(
            message="\n".join(lines),
            data={"date": target_date.isoformat(), "count": len(appts)},
            action_type="read",
            suggestions=["Agenda de demain", "Prends un RDV"],
        )

    def _handle_query_finance(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        employer_id = user.get_employer_id()
        today = datetime.now().date()
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())

        # Recettes du jour (Paiements encaissés)
        rev_today = db.query(func.sum(models.Payment.amount)).join(models.Patient).filter(
            models.Patient.employer_id == employer_id,
            models.Payment.payment_date >= today_start,
            models.Payment.payment_date <= today_end,
        ).scalar() or 0.0

        # Recettes du mois (Paiements encaissés)
        month_start = today.replace(day=1)
        rev_month = db.query(func.sum(models.Payment.amount)).join(models.Patient).filter(
            models.Patient.employer_id == employer_id,
            models.Payment.payment_date >= datetime.combine(month_start, datetime.min.time()),
            models.Payment.payment_date <= today_end,
        ).scalar() or 0.0

        # Calcul créances — une seule requête GROUP BY (remplace la boucle O(N))
        acts_sub = (
            db.query(models.Acte.patient_id, func.sum(models.Acte.montant).label("total_acts"))
            .group_by(models.Acte.patient_id)
            .subquery()
        )
        pays_sub = (
            db.query(models.Payment.patient_id, func.sum(models.Payment.amount).label("total_pays"))
            .group_by(models.Payment.patient_id)
            .subquery()
        )
        from sqlalchemy import literal_column
        debt_expr = (
            func.coalesce(acts_sub.c.total_acts, 0) - func.coalesce(pays_sub.c.total_pays, 0)
        ).label("debt")

        debtor_rows = (
            db.query(models.Patient.nom, models.Patient.prenom, debt_expr)
            .outerjoin(acts_sub, acts_sub.c.patient_id == models.Patient.id)
            .outerjoin(pays_sub, pays_sub.c.patient_id == models.Patient.id)
            .filter(models.Patient.employer_id == employer_id)
            .having(debt_expr > 0)
            .order_by(debt_expr.desc())
            .limit(3)
            .all()
        )
        total_debt = float(
            db.query(func.sum(
                func.coalesce(acts_sub.c.total_acts, 0) - func.coalesce(pays_sub.c.total_pays, 0)
            ))
            .outerjoin(acts_sub, acts_sub.c.patient_id == models.Patient.id)
            .outerjoin(pays_sub, pays_sub.c.patient_id == models.Patient.id)
            .filter(models.Patient.employer_id == employer_id)
            .scalar() or 0.0
        )
        debtors = debtor_rows

        fmt = lambda n: f"{int(n):,}".replace(",", " ")

        lines = [
            f"💰 **Synthèse Financière**\n",
            f"📊 Aujourd'hui : **{fmt(rev_today)} MAD**",
            f"📈 Ce mois : **{fmt(rev_month)} MAD**",
            f"⚠️ Créances totales : **{fmt(total_debt)} MAD**",
        ]
        if debtors:
            lines.append("\n🔴 **Top débiteurs :**")
            for d in debtors:
                lines.append(f"  · {d.prenom} {d.nom} — {fmt(d.debt)} MAD")

        return BotResponse(
            message="\n".join(lines),
            data={
                "today_revenue": round(float(rev_today), 2),
                "month_revenue": round(float(rev_month), 2),
                "total_debt": round(float(total_debt), 2),
            },
            action_type="read",
            suggestions=["Projection mensuelle", "Taux de conversion", "Briefing demain"],
        )

    def _handle_query_lab(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        employer_id = user.get_employer_id()
        jobs = (
            db.query(models.LabJob)
            .join(models.Patient, models.LabJob.patient_id == models.Patient.id)
            .filter(models.Patient.employer_id == employer_id)
            .all()
        )
        if not jobs:
            return BotResponse(
                message="🔬 Aucun travail de laboratoire en cours.",
                action_type="read",
            )

        by_status: Dict[str, int] = {}
        for j in jobs:
            by_status[j.status] = by_status.get(j.status, 0) + 1

        lines = [f"🔬 **Laboratoire** — {len(jobs)} travaux\n"]
        status_labels = {
            "PRESCRIPTION": "📝 En prescription",
            "SENT": "📤 Envoyés",
            "IN_PROGRESS": "⚙️ En fabrication",
            "RECEIVED": "📥 Reçus",
            "DELIVERED": "✅ Livrés",
        }
        for status, count in by_status.items():
            label = status_labels.get(status, status)
            lines.append(f"  {label} : **{count}**")

        return BotResponse(
            message="\n".join(lines),
            data={"total": len(jobs), "by_status": by_status},
            action_type="read",
        )

    def _handle_query_stats(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        employer_id = user.get_employer_id()
        text = parsed.raw_message.lower()

        if "conversion" in text or "taux" in text:
            from backend.routers.intelligence import get_taux_conversion
            # Simuler une requête directe
            return BotResponse(
                message="📊 Pour les stats de conversion, consultez le **Dashboard Intelligence**.",
                action_type="read",
                suggestions=["Projection mensuelle", "Finance"],
            )

        if "projection" in text or "forecast" in text:
            return BotResponse(
                message="📈 Pour les projections, consultez le **Dashboard Intelligence**.",
                action_type="read",
                suggestions=["Recettes du mois", "Briefing demain"],
            )

        # Stats génériques
        total_patients = db.query(func.count(models.Patient.id)).filter(
            models.Patient.employer_id == employer_id
        ).scalar() or 0

        total_acts = db.query(func.count(models.Acte.id)).join(models.Patient).filter(
            models.Patient.employer_id == employer_id
        ).scalar() or 0

        return BotResponse(
            message=(
                f"📊 **Statistiques globales**\n"
                f"👥 {total_patients} patients\n"
                f"🦷 {total_acts} actes au total"
            ),
            data={"total_patients": total_patients, "total_acts": total_acts},
            action_type="read",
            suggestions=["Taux de conversion", "Projection mensuelle"],
        )

    def _handle_query_alerts(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        employer_id = user.get_employer_id()
        today_start = datetime.combine(datetime.now().date(), datetime.min.time())

        alerts = db.query(models.ProactiveAlert).filter(
            models.ProactiveAlert.employer_id == employer_id,
            models.ProactiveAlert.created_at >= today_start,
            models.ProactiveAlert.is_read == False,
        ).order_by(models.ProactiveAlert.priority).limit(10).all()

        if not alerts:
            return BotResponse(
                message="✅ Aucune alerte active aujourd'hui. Tout est sous contrôle.",
                action_type="read",
            )

        lines = [f"🔔 **{len(alerts)} alertes actives**\n"]
        for a in alerts:
            emoji = "🔴" if a.priority == 1 else "🟡" if a.priority == 2 else "🔵"
            lines.append(f"{emoji} {a.title} — {a.message}")

        return BotResponse(
            message="\n".join(lines),
            data={"count": len(alerts)},
            action_type="read",
        )

    # ── ACTION HANDLERS (écriture — retourne pending_action) ──────────────

    def _handle_create_appointment(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        e = parsed.entities
        patient_name = e.get("patient_name", "")
        target_date = e.get("target_date", "")
        time = e.get("time", "09:00")
        motif = e.get("motif", "Consultation")
        duration = e.get("duration_minutes", 30)

        # Résoudre le patient
        patient_id = e.get("patient_id")
        if not patient_id and patient_name:
            employer_id = user.get_employer_id()
            patient = db.query(models.Patient).filter(
                models.Patient.employer_id == employer_id,
                or_(
                    func.concat(models.Patient.prenom, " ", models.Patient.nom).ilike(f"%{patient_name}%"),
                    func.concat(models.Patient.nom, " ", models.Patient.prenom).ilike(f"%{patient_name}%"),
                )
            ).first()
            if patient:
                patient_id = patient.id
                patient_name = f"{patient.prenom} {patient.nom}"

        date_str = target_date or datetime.now().date().isoformat()
        
        # Vérifier si la date tombe pendant un congé ou un jour férié
        try:
            target_dt = datetime.fromisoformat(date_str)
            exception = db.query(models.AgendaException).filter(
                models.AgendaException.start_date <= target_dt,
                models.AgendaException.end_date >= target_dt
            ).first()
            if exception:
                return BotResponse(
                    message=(
                        f"⚠️ **Impossible de prendre RDV le {date_str}.**\n"
                        f"Le cabinet est fermé pour : **{exception.reason}**.\n"
                        f"Voulez-vous choisir une autre date ?"
                    ),
                    action_type="read",
                    suggestions=["Demain", "La semaine prochaine"]
                )
        except Exception as e:
            logger.warning("Vérification congés agenda ignorée : %s", e)

        return BotResponse(
            message=(
                f"📅 **Nouveau RDV proposé :**\n"
                f"👤 {patient_name or 'Patient à identifier'}\n"
                f"📆 {date_str} à {time}\n"
                f"🦷 {motif} · {duration}min\n\n"
                f"Confirmez-vous la création ?"
            ),
            action_type="write_pending",
            pending_action={
                "type": "CREATE_APPOINTMENT",
                "params": {
                    "patient_id": patient_id,
                    "patient_name": patient_name,
                    "datetime_start": f"{date_str}T{time}:00",
                    "motif": motif,
                    "duration_minutes": duration,
                },
            },
            suggestions=["Confirmer", "Annuler"],
        )

    def _handle_create_prescription(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        e = parsed.entities
        patient_id = e.get("patient_id")
        patient_name = e.get("patient_name", "")
        procedure = e.get("procedure", "")

        if not patient_id and patient_name:
            employer_id = user.get_employer_id()
            patient = db.query(models.Patient).filter(
                models.Patient.employer_id == employer_id,
                or_(
                    func.concat(models.Patient.prenom, " ", models.Patient.nom).ilike(f"%{patient_name}%"),
                    func.concat(models.Patient.nom, " ", models.Patient.prenom).ilike(f"%{patient_name}%"),
                )
            ).first()
            if patient:
                patient_id = patient.id
                patient_name = f"{patient.prenom} {patient.nom}"

        if not patient_id:
            return BotResponse(
                message="Pour quelle patient souhaitez-vous l'ordonnance ?",
                action_type="clarification",
                suggestions=["Cherche un patient"],
            )

        # Préparer la suggestion de prescription via le service existant
        from backend.services.prescription_service import prescription_service
        try:
            smart = prescription_service.resolve_smart_prescription(
                db, patient_id, [procedure] if procedure else ["CONSULTATION"],
                doctor_id=user.id,
            )
            drugs_summary = "\n".join(
                f"  · {d.get('name', '?')} {d.get('dosage', '')} — {d.get('posologie', '')}"
                for d in smart.get("drugs", [])
            )
        except Exception as e:
            logger.warning("Smart prescription indisponible : %s", e)
            smart = {"drugs": [], "source": "Système"}
            drugs_summary = "  (suggestion automatique non disponible)"

        return BotResponse(
            message=(
                f"💊 **Ordonnance proposée pour {patient_name or f'Patient #{patient_id}'}**\n"
                f"Source : {smart.get('source', 'Système')}\n\n"
                f"Médicaments suggérés :\n{drugs_summary}\n\n"
                f"Voulez-vous ouvrir l'éditeur d'ordonnance avec ces suggestions ?"
            ),
            action_type="write_pending",
            pending_action={
                "type": "OPEN_PRESCRIPTION_EDITOR",
                "params": {
                    "patient_id": patient_id,
                    "suggested_drugs": smart.get("drugs", []),
                    "procedure": procedure,
                },
            },
            suggestions=["Ouvrir l'éditeur", "Modifier", "Annuler"],
        )

    def _handle_create_devis(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        e = parsed.entities
        patient_id = e.get("patient_id")
        patient_name = e.get("patient_name", "")
        procedure = e.get("procedure", "")
        tooth = e.get("tooth_number", "")

        if not patient_id and patient_name:
            employer_id = user.get_employer_id()
            patient = db.query(models.Patient).filter(
                models.Patient.employer_id == employer_id,
                or_(
                    func.concat(models.Patient.prenom, " ", models.Patient.nom).ilike(f"%{patient_name}%"),
                    func.concat(models.Patient.nom, " ", models.Patient.prenom).ilike(f"%{patient_name}%"),
                )
            ).first()
            if patient:
                patient_id = patient.id
                patient_name = f"{patient.prenom} {patient.nom}"

        if not patient_id:
            return BotResponse(
                message="Pour quel patient souhaitez-vous établir le devis ?",
                action_type="clarification",
                suggestions=["Cherche un patient"],
            )

        return BotResponse(
            message=(
                f"📄 **Devis proposé :**\n"
                f"👤 {patient_name or f'Patient #{patient_id}'}\n"
                f"🦷 {procedure or 'À définir'} {f'(dent {tooth})' if tooth else ''}\n\n"
                f"Voulez-vous ouvrir le module de devis ?"
            ),
            action_type="write_pending",
            pending_action={
                "type": "OPEN_DEVIS_EDITOR",
                "params": {
                    "patient_id": patient_id,
                    "procedure": procedure,
                    "tooth_number": tooth,
                },
            },
            suggestions=["Ouvrir le devis", "Annuler"],
        )

    def _handle_search_patient(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        employer_id = user.get_employer_id()
        name = parsed.entities.get("patient_name", "")

        if not name:
            # Extraire manuellement du message brut
            import re
            m = re.search(r"(?:cherche|trouve|recherche)\s+(.+)", parsed.raw_message.lower())
            if m:
                name = m.group(1).strip()
                if name in ["un patient", "le patient", "patient", "des patients"]:
                    name = ""

        if not name:
            return BotResponse(
                message="Quel nom cherchez-vous ?",
                action_type="clarification",
            )

        patients = db.query(models.Patient).filter(
            models.Patient.employer_id == employer_id,
            or_(
                models.Patient.nom.ilike(f"%{name}%"),
                models.Patient.prenom.ilike(f"%{name}%"),
                func.concat(models.Patient.prenom, " ", models.Patient.nom).ilike(f"%{name}%"),
            )
        ).limit(10).all()

        if not patients:
            return BotResponse(
                message=f"Aucun patient trouvé pour « {name} ».",
                action_type="read",
                suggestions=["Ajouter un patient"],
            )

        lines = [f"🔍 **{len(patients)} résultat(s) pour « {name} » :**\n"]
        for p in patients:
            lines.append(
                f"  · **{p.prenom} {p.nom}** (#{p.id}) — {p.telephone or '—'}"
            )

        return BotResponse(
            message="\n".join(lines),
            data={"results": [{"id": p.id, "nom": p.nom, "prenom": p.prenom} for p in patients]},
            action_type="read",
            suggestions=[f"Info patient {patients[0].id}" for p in patients[:1]],
        )

    def _handle_change_status(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        return BotResponse(
            message="Pour changer le statut d'un RDV, précisez le patient et le nouveau statut (en cours, terminé, annulé).",
            action_type="clarification",
            suggestions=["Agenda d'aujourd'hui"],
        )

    # ── HELP & UNKNOWN ──────────────────────────────────────────────────────

    def _handle_query_knowledge(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        from backend.services.bot.knowledge_base import search_knowledge
        answer = search_knowledge(parsed.raw_message)
        
        return BotResponse(
            message=answer,
            action_type="info",
            suggestions=["Aide", "Agenda", "Cherche un patient"],
        )

    def _handle_help(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        return BotResponse(
            message=(
                "🤖 **Crown Bot — Votre assistant intelligent**\n\n"
                "Voici ce que je sais faire :\n\n"
                "📋 **Consulter**\n"
                "  · Info patient → _\"dossier Ahmed Bennani\"_\n"
                "  · Agenda → _\"rdv de demain\"_\n"
                "  · Finances → _\"recettes du mois\"_\n"
                "  · Labo → _\"état des travaux labo\"_\n"
                "  · Alertes → _\"alertes du jour\"_\n\n"
                "✏️ **Créer**\n"
                "  · RDV → _\"prends rdv pour Ahmed demain 10h\"_\n"
                "  · Ordonnance → _\"ordonnance post-extraction patient 5\"_\n"
                "  · Devis → _\"devis couronne dent 46 patient 5\"_\n\n"
                "🔍 **Rechercher**\n"
                "  · _\"cherche un patient Benn\"_\n"
            ),
            action_type="info",
            suggestions=[
                "Agenda d'aujourd'hui",
                "Recettes du mois",
                "Alertes du jour",
                "Cherche un patient",
            ],
        )

    def _handle_greeting(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        from backend.services.bot.llm_parser import llm_parser
        from backend.services.security.data_sanitizer import data_sanitizer
        message = parsed.raw_message
        
        # Anonymisation
        sanitized_message, mapping = data_sanitizer.sanitize(message)
        
        prompt = (
            f"L'utilisateur vient de te saluer ou de te dire : '{sanitized_message}'. "
            "Réponds brièvement, de manière très naturelle et chaleureuse (1-2 phrases max) en tant que Crown Bot (assistant IA d'un logiciel de gestion dentaire). "
            "Propose ton aide (ex: chercher un patient, afficher l'agenda, etc.). "
            "Réponds en texte brut, n'utilise pas de JSON ni de markdown complexe."
        )
        
        try:
            import httpx
            with httpx.Client(timeout=4.0) as client:
                response = client.post(
                    f"{llm_parser.api_base}/chat/completions",
                    headers={"Authorization": f"Bearer {llm_parser.api_key}"},
                    json={
                        "model": llm_parser.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.5
                    }
                )
            if response.status_code == 200:
                data = response.json()
                text = data["choices"][0]["message"]["content"].strip()
                # Restauration
                text = data_sanitizer.restore(text, mapping)
            else:
                text = "Bonjour ! 👋 Je suis le **Crown Bot**.\n\nComment puis-je vous aider aujourd'hui ? (Agenda, Finances, Patients...)"
        except Exception as e:
            logger.error(f"Erreur LLM conversationnel (Greeting): {e}")
            text = "Bonjour ! 👋 Je suis le **Crown Bot**.\n\nComment puis-je vous aider aujourd'hui ? (Agenda, Finances, Patients...)"

        return BotResponse(
            message=text,
            action_type="info",
            suggestions=["Aide", "Agenda du jour", "Chercher un patient"],
        )

    def _handle_unknown(
        self, parsed: ParsedIntent, db: Session, user: models.User
    ) -> BotResponse:
        from backend.services.bot.llm_parser import llm_parser
        from backend.services.security.data_sanitizer import data_sanitizer
        message = parsed.raw_message
        
        # Anonymisation
        sanitized_message, mapping = data_sanitizer.sanitize(message)
        
        prompt = (
            f"L'utilisateur t'a dit ceci : '{sanitized_message}'. "
            "Cependant, tu n'as pas réussi à comprendre l'intention exacte car cela sort de tes capacités principales (agenda, finances, recherche patient, devis). "
            "Réponds poliment en tant que Crown Bot (assistant de cabinet dentaire), indique avec tact que tu n'as pas compris, et invite l'utilisateur à taper 'aide'. "
            "Réponds en texte brut (1-2 phrases max), sois concis et professionnel."
        )
        
        try:
            import httpx
            with httpx.Client(timeout=4.0) as client:
                response = client.post(
                    f"{llm_parser.api_base}/chat/completions",
                    headers={"Authorization": f"Bearer {llm_parser.api_key}"},
                    json={
                        "model": llm_parser.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.5
                    }
                )
            if response.status_code == 200:
                data = response.json()
                text = data["choices"][0]["message"]["content"].strip()
                # Restauration
                text = data_sanitizer.restore(text, mapping)
            else:
                text = "Je n'ai pas compris votre demande. Tapez **aide** pour voir ce que je sais faire."
        except Exception as e:
            logger.error(f"Erreur LLM conversationnel (Unknown): {e}")
            text = "Je n'ai pas compris votre demande. Tapez **aide** pour voir ce que je sais faire."

        return BotResponse(
            message=text,
            action_type="info",
            suggestions=["Aide", "Agenda", "Finances"],
        )

    def _contextual_suggestions(self, intent: str) -> List[str]:
        """Retourne des suggestions contextuelles pour un intent."""
        return {
            "CREATE_APPOINTMENT": ["Prends rdv pour Ahmed demain 10h", "Agenda"],
            "CREATE_PRESCRIPTION": ["Ordonnance post-extraction patient 5", "Info patient"],
            "CREATE_DEVIS": ["Devis couronne dent 46 patient 5", "Cherche patient"],
            "QUERY_PATIENT": ["Info patient 12", "Cherche Ahmed"],
        }.get(intent, ["Aide"])


# Singleton
action_dispatcher = ActionDispatcher()
