; Installeur Digital Crown — pas de droits admin, pas de service SYSTEM.
;
; Doctrine (cf. plan cryptic-noodling-volcano.md, docs/CABINET_ONPREM_GUIDE.md §2
; Option B) : installation par utilisateur courant, lancement via une tâche
; planifiée au logon (pas NSSM/service élevé) — plus simple pour un dentiste
; seul sur son propre poste, aucune invite UAC.
;
; Ce script copie le build PyInstaller déjà produit (dist\DigitalCrown\) — il
; ne compile jamais l'application lui-même. `run.py::_first_boot_bootstrap()`
; génère les secrets et la config au tout premier lancement de l'EXE, cet
; installeur n'a donc RIEN à configurer lui-même (aucun secret ne transite
; par ce script).
;
; ATTENTION : ne jamais exécuter le résultat compilé de ce script sur une
; machine où un vrai cabinet tourne déjà (crée une tâche planifiée réelle qui
; lance l'EXE à chaque logon). Toujours tester sur une VM/poste isolé.

#define MyAppName "DigitalCrown"
#define MyAppPublisher "SANINOVA"
#define MyAppExeName "DigitalCrown.exe"
#define MyAppTaskName "DigitalCrown"
#define MyDistDir "..\dist\DigitalCrown"

[Setup]
AppId={{8F1B6C1E-6C7E-4B7B-9C7C-7E6C1E6C7E6C}
AppName={#MyAppName}
AppVersion=1.0.0
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Pas de droits admin — installation strictement par utilisateur courant.
PrivilegesRequired=lowest
OutputDir=..\dist_installer
OutputBaseFilename=DigitalCrownSetup
; zip : nettement plus rapide que lzma2 sur ~3,2 Go de binaires ML déjà
; denses (DLL, .onnx, .pt) au prix d'un installeur un peu plus gros. À
; repasser en lzma2/SolidCompression=yes pour la distribution finale si le
; temps de compilation n'est plus une contrainte (voir plan d'installation).
Compression=zip
SolidCompression=no
WizardStyle=modern
; Désinstalleur listé dans "Applications et fonctionnalités" malgré l'install per-user.
UninstallDisplayIcon={app}\{#MyAppExeName}
; Fermer l'app si elle tourne déjà avant d'écraser les fichiers (mise à jour).
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
Source: "{#MyDistDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Démarrer Digital Crown et ouvrir l'interface"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Démarrer Digital Crown et ouvrir l'interface"

[Run]
; Tâche planifiée au logon de l'utilisateur courant (pas de service SYSTEM,
; pas de mot de passe à stocker, pas d'élévation nécessaire).
Filename: "{sys}\schtasks.exe"; \
    Parameters: "/create /tn ""{#MyAppTaskName}"" /tr ""\""{app}\{#MyAppExeName}\"""" /sc onlogon /rl limited /f"; \
    Flags: runhidden; StatusMsg: "Configuration du démarrage automatique..."

; Premier lancement immédiat après installation (la tâche planifiée ne se
; déclenche qu'au prochain logon — sans ceci, rien ne tourne tant que
; l'utilisateur ne se reconnecte pas). run.py ouvre le navigateur tout seul
; une fois le backend prêt (sys.frozen -> open_browser()).
Filename: "{app}\{#MyAppExeName}"; Description: "Lancer {#MyAppName}"; \
    Flags: nowait postinstall skipifsilent runasoriginaluser

[UninstallRun]
; Supprime la tâche planifiée avant de retirer les fichiers — jamais l'inverse
; (sinon la tâche pointerait vers un EXE qui n'existe plus).
Filename: "{sys}\schtasks.exe"; Parameters: "/delete /tn ""{#MyAppTaskName}"" /f"; \
    Flags: runhidden; RunOnceId: "RemoveDigitalCrownTask"

[UninstallDelete]
; Ne supprime QUE les fichiers programme copiés par [Files] (comportement
; Inno Setup par défaut). %APPDATA%\DigitalCrown\ (données patients, .env,
; logs, backups) n'est JAMAIS référencé ici — règle absolue du projet :
; ne jamais perdre de vraie donnée patient. Une suppression des données doit
; rester une action manuelle et explicite, jamais un effet de bord de la
; désinstallation du programme.
