; Factorealm — Script Inno Setup 6 (Windows x64)
; Auteur initial : Thibstudio24 — Licence code envisagée : AGPL-3.0
; À compiler sur un poste Windows avec Inno Setup 6.1+ (ISCC.exe).

#define MyAppName "Factorealm"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#define MyAppPublisher "Thibstudio24"
#define MyAppURL "https://github.com/Thibstudio24/FACTOREALM"

; Version Node.js 22 LTS téléchargée automatiquement si Node 22+ est absent du serveur
#define NodeInstallerUrl "https://nodejs.org/dist/v22.21.0/node-v22.21.0-x64.msi"
#define NodeInstallerName "node-v22.21.0-x64.msi"

[Setup]
AppId={{8C91F4E2-3C7A-4D88-9F1E-42FA00000001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\Factorealm
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
OutputDir=..\..\dist-packages
OutputBaseFilename=Factorealm-Setup-{#MyAppVersion}-x64
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "registerservice"; Description: "Démarrer automatiquement le serveur Factorealm au démarrage de Windows (tâche système)"
Name: "desktopstart"; Description: "Créer un raccourci pour lancer le serveur sur le Bureau"; Flags: unchecked
Name: "desktopicon"; Description: "Créer un raccourci d'ouverture dans le navigateur sur le Bureau"; Flags: unchecked

[Dirs]
Name: "{commonappdata}\Factorealm\data\uploads"

[InstallDelete]
Type: files; Name: "{app}\package-lock.json"
Type: filesandordirs; Name: "{app}\node_modules"

[Files]
; Copier le serveur et, selon disponibilité au moment du packaging, soit dist/ précompilé soit les sources nécessaires au build
Source: "..\..\server.ts"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\bin\*"; DestDir: "{app}\bin"; Flags: ignoreversion recursesubdirs createallsubdirs
#if FileExists(AddBackslash(SourcePath) + "..\..\dist\index.html")
Source: "..\..\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\src\core\*"; DestDir: "{app}\src\core"; Excludes: "*.test.*,*.spec.*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\src\server\*"; DestDir: "{app}\src\server"; Excludes: "*.test.*,*.spec.*"; Flags: ignoreversion recursesubdirs createallsubdirs
#else
Source: "..\..\index.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\vite.config.ts"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\tsconfig.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\src\*"; DestDir: "{app}\src"; Excludes: "*.test.*,*.spec.*"; Flags: ignoreversion recursesubdirs createallsubdirs
#endif
Source: "..\..\migrations\*"; DestDir: "{app}\migrations"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\installer\install.mjs"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "..\..\installer\installerCore.mjs"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "..\..\installer\bootstrap-company.ts"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "..\..\installer\windows\install-from-inno.ps1"; DestDir: "{app}\installer\windows"; Flags: ignoreversion

[Registry]
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; Check: NeedsAddPath(ExpandConstant('{app}\bin'))

[Icons]
Name: "{group}\Lancer le serveur Factorealm"; Filename: "{app}\factorealm-start.cmd"; WorkingDir: "{app}"; Comment: "Démarrer le serveur Factorealm (port {code:GetPort})"
Name: "{group}\Ouvrir Factorealm (navigateur)"; Filename: "http://127.0.0.1:{code:GetPort}"; Comment: "Ouvrir l'interface web Factorealm"
Name: "{group}\Désinstaller Factorealm"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Lancer le serveur Factorealm"; Filename: "{app}\factorealm-start.cmd"; WorkingDir: "{app}"; Tasks: desktopstart
Name: "{autodesktop}\Ouvrir Factorealm"; Filename: "http://127.0.0.1:{code:GetPort}"; Tasks: desktopicon

[Run]
; 1. Installer Node.js 22 LTS silencieusement uniquement s'il vient d'être téléchargé
Filename: "msiexec.exe"; Parameters: "/i ""{tmp}\{#NodeInstallerName}"" /qn /norestart"; StatusMsg: "Installation de Node.js 22 LTS (prérequis serveur)..."; Check: NeedsNodeInstall; Flags: waituntilterminated

; 2. Installer les dépendances npm, écrire .env, compiler et initialiser l'entreprise si demandée
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\windows\install-from-inno.ps1"""; StatusMsg: "Installation des dépendances npm et configuration de Factorealm (cela peut prendre quelques minutes)..."; Flags: waituntilterminated

; 3. Option d'ouverture immédiate après installation
Filename: "http://127.0.0.1:{code:GetPort}"; Description: "Ouvrir Factorealm dans le navigateur"; Flags: postinstall shellexec skipifsilent

[UninstallRun]
Filename: "{app}\bin\factorealm.cmd"; Parameters: "stop"; Flags: runhidden; RunOnceId: "StopFactorealmCli"
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\unregister-windows-task.ps1"""; Flags: runhidden; RunOnceId: "RemoveFactorealmTask"

[Code]
function SetEnvironmentVariableW(lpName, lpValue: String): BOOL;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

var
  NetworkPage: TInputQueryWizardPage;
  HostOptionPage: TInputOptionWizardPage;
  CompanyModePage: TInputOptionWizardPage;
  CompanyInfoPage: TInputQueryWizardPage;
  AdminInfoPage: TInputQueryWizardPage;
  DownloadPage: TDownloadWizardPage;
  NodeMissing: Boolean;

function IsNode22Installed(): Boolean;
var
  ResultCode: Integer;
  NodeExe: String;
  TmpOut: String;
  Content: AnsiString;
  MajorStr: String;
begin
  Result := False;
  NodeExe := ExpandConstant('{commonpf}\nodejs\node.exe');
  if not FileExists(NodeExe) then
    NodeExe := ExpandConstant('{localappdata}\Programs\nodejs\node.exe');
  if not FileExists(NodeExe) then
    NodeExe := 'node.exe';

  TmpOut := ExpandConstant('{tmp}\nodever.txt');
  if Exec('cmd.exe', '/c ""' + NodeExe + '" -p "process.versions.node.split(''.'')[0]" > "' + TmpOut + '""', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if (ResultCode = 0) and LoadStringFromFile(TmpOut, Content) then
    begin
      MajorStr := Trim(String(Content));
      if StrToIntDef(MajorStr, 0) >= 22 then
        Result := True;
    end;
  end;
end;

function NeedsNodeInstall(): Boolean;
begin
  Result := NodeMissing;
end;

function GetPort(Param: String): String;
begin
  Result := Trim(NetworkPage.Values[0]);
  if Result = '' then Result := '3000';
end;

function GetDataDir(Param: String): String;
begin
  Result := Trim(NetworkPage.Values[1]);
  if Result = '' then Result := ExpandConstant('{commonappdata}\Factorealm\data');
end;

function GetHost(Param: String): String;
begin
  if HostOptionPage.SelectedValueIndex = 1 then
    Result := '0.0.0.0'
  else
    Result := '127.0.0.1';
end;

function GetInitCompanyFlag(Param: String): String;
begin
  if CompanyModePage.SelectedValueIndex = 1 then
    Result := '1'
  else
    Result := '0';
end;

function GetCompanyName(Param: String): String;
begin
  Result := Trim(CompanyInfoPage.Values[0]);
end;

function GetSiret(Param: String): String;
begin
  Result := Trim(CompanyInfoPage.Values[1]);
end;

function GetAdminName(Param: String): String;
begin
  Result := Trim(AdminInfoPage.Values[0]);
end;

function GetAdminEmail(Param: String): String;
begin
  Result := Trim(AdminInfoPage.Values[1]);
end;

function GetRegisterTaskFlag(Param: String): String;
begin
  if WizardIsTaskSelected('registerservice') then
    Result := '1'
  else
    Result := '0';
end;

procedure InitializeWizard();
begin
  NodeMissing := not IsNode22Installed();

  NetworkPage := CreateInputQueryPage(wpSelectTasks,
    'Configuration du serveur et des données',
    'Port d''écoute HTTP et emplacement persistant de la base SQLite.',
    'Indiquez le port local et le dossier dans lequel seront enregistrées la base comptable et les pièces justificatives.');
  NetworkPage.Add('Port HTTP (1 à 65535) :', False);
  NetworkPage.Add('Dossier persistant des données :', False);
  NetworkPage.Values[0] := '3000';
  NetworkPage.Values[1] := ExpandConstant('{commonappdata}\Factorealm\data');

  HostOptionPage := CreateInputOptionPage(NetworkPage.ID,
    'Exposition réseau du serveur',
    'Choisissez l''interface réseau d''écoute de Factorealm.',
    'Par défaut, Factorealm écoute uniquement en local (recommandé avec un proxy TLS ou WireGuard).',
    True, False);
  HostOptionPage.Add('Local uniquement (127.0.0.1) — recommandé');
  HostOptionPage.Add('Réseau local / VPN (0.0.0.0) — nécessite un pare-feu adapté');
  HostOptionPage.SelectedValueIndex := 0;

  CompanyModePage := CreateInputOptionPage(HostOptionPage.ID,
    'Initialisation de l''entreprise',
    'Quand souhaitez-vous créer l''entreprise et le compte administrateur ?',
    'Aucun mot de passe administrateur prédéfini n''est utilisé.',
    True, False);
  CompanyModePage.Add('Configurer dans le navigateur au premier lancement (recommandé)');
  CompanyModePage.Add('Configurer l''entreprise et l''administrateur maintenant');
  CompanyModePage.SelectedValueIndex := 0;

  CompanyInfoPage := CreateInputQueryPage(CompanyModePage.ID,
    'Informations de l''entreprise',
    'Renseignez la raison sociale de votre entreprise.',
    'Vous pourrez compléter l''adresse, l''IBAN et le logo après installation.');
  CompanyInfoPage.Add('Raison sociale * :', False);
  CompanyInfoPage.Add('SIRET (14 chiffres, optionnel) :', False);

  AdminInfoPage := CreateInputQueryPage(CompanyInfoPage.ID,
    'Premier compte administrateur',
    'Définissez votre propre mot de passe (10 caractères minimum).',
    'Une clé de récupération entreprise (FRK-...) sera enregistrée dans votre dossier d''installation ou affichée à l''écran.');
  AdminInfoPage.Add('Nom complet * :', False);
  AdminInfoPage.Add('Courriel administrateur * :', False);
  AdminInfoPage.Add('Mot de passe (10 caractères min.) * :', True);

  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), nil);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if ((PageID = CompanyInfoPage.ID) or (PageID = AdminInfoPage.ID)) and (CompanyModePage.SelectedValueIndex <> 1) then
    Result := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  PortNum: Integer;
begin
  Result := True;

  if CurPageID = NetworkPage.ID then
  begin
    PortNum := StrToIntDef(Trim(NetworkPage.Values[0]), -1);
    if (PortNum < 1) or (PortNum > 65535) then
    begin
      MsgBox('Veuillez saisir un port valide entre 1 et 65535.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = CompanyInfoPage.ID then
  begin
    if Trim(CompanyInfoPage.Values[0]) = '' then
    begin
      MsgBox('La raison sociale est obligatoire.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = AdminInfoPage.ID then
  begin
    if (Trim(AdminInfoPage.Values[0]) = '') or (Pos('@', AdminInfoPage.Values[1]) = 0) then
    begin
      MsgBox('Veuillez saisir un nom complet et un courriel valides.', mbError, MB_OK);
      Result := False;
    end
    else if Length(AdminInfoPage.Values[2]) < 10 then
    begin
      MsgBox('Le mot de passe administrateur doit contenir au moins 10 caractères.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = wpReady then
  begin
    if NodeMissing then
    begin
      DownloadPage.Clear;
      DownloadPage.Add('{#NodeInstallerUrl}', '{#NodeInstallerName}', '');
      DownloadPage.Show;
      try
        try
          DownloadPage.Download;
        except
          if DownloadPage.AbortedByUser then
            Log('Téléchargement Node.js annulé par l''utilisateur.')
          else
            MsgBox('Impossible de télécharger Node.js 22 LTS automatiquement : ' + GetExceptionMessage + #13#10 + 'Vérifiez votre connexion Internet ou installez Node.js 22 LTS manuellement.', mbCriticalError, MB_OK);
          Result := False;
        end;
      finally
        DownloadPage.Hide;
      end;
    end;
  end;
end;

function NeedsAddPath(Param: String): Boolean;
var
  OrigPath: String;
  CleanParam: String;
begin
  CleanParam := RemoveBackslashUnlessRoot(Param);
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + UpperCase(CleanParam) + ';', ';' + UpperCase(OrigPath) + ';') = 0;
end;

procedure RemoveDirFromMachinePath(DirToRemove: String);
var
  OrigPath, CleanDir, NewPath, Part: String;
  P: Integer;
begin
  CleanDir := UpperCase(RemoveBackslashUnlessRoot(DirToRemove));
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath) then
    exit;

  NewPath := '';
  while Length(OrigPath) > 0 do
  begin
    P := Pos(';', OrigPath);
    if P > 0 then
    begin
      Part := Copy(OrigPath, 1, P - 1);
      Delete(OrigPath, 1, P);
    end
    else
    begin
      Part := OrigPath;
      OrigPath := '';
    end;
    Part := Trim(Part);
    if (Part <> '') and (UpperCase(RemoveBackslashUnlessRoot(Part)) <> CleanDir) then
    begin
      if NewPath <> '' then
        NewPath := NewPath + ';';
      NewPath := NewPath + Part;
    end;
  end;

  RegWriteExpandStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', NewPath);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  LogPath: String;
  LogAnsi: AnsiString;
  LogText: String;
begin
  if CurStep = ssInstall then
  begin
    SetEnvironmentVariableW('FACTOREALM_INNO_INSTALL_DIR', RemoveBackslashUnlessRoot(ExpandConstant('{app}')));
    SetEnvironmentVariableW('FACTOREALM_INNO_DATA_DIR', RemoveBackslashUnlessRoot(GetDataDir('')));
    SetEnvironmentVariableW('FACTOREALM_INNO_PORT', GetPort(''));
    SetEnvironmentVariableW('FACTOREALM_INNO_HOST', GetHost(''));
    SetEnvironmentVariableW('FACTOREALM_INNO_INIT_COMPANY', GetInitCompanyFlag(''));
    SetEnvironmentVariableW('FACTOREALM_INNO_COMPANY_NAME', GetCompanyName(''));
    SetEnvironmentVariableW('FACTOREALM_INNO_SIRET', GetSiret(''));
    SetEnvironmentVariableW('FACTOREALM_INNO_ADMIN_NAME', GetAdminName(''));
    SetEnvironmentVariableW('FACTOREALM_INNO_ADMIN_EMAIL', GetAdminEmail(''));
    SetEnvironmentVariableW('FACTOREALM_INNO_REGISTER_TASK', GetRegisterTaskFlag(''));
    if CompanyModePage.SelectedValueIndex = 1 then
      SetEnvironmentVariableW('FACTOREALM_INNO_ADMIN_PASS', AdminInfoPage.Values[2]);
  end
  else if CurStep = ssPostInstall then
  begin
    SetEnvironmentVariableW('FACTOREALM_INNO_ADMIN_PASS', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_INSTALL_DIR', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_DATA_DIR', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_PORT', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_HOST', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_INIT_COMPANY', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_COMPANY_NAME', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_SIRET', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_ADMIN_NAME', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_ADMIN_EMAIL', '');
    SetEnvironmentVariableW('FACTOREALM_INNO_REGISTER_TASK', '');
    if not FileExists(ExpandConstant('{app}\node_modules\tsx\dist\cli.mjs')) then
    begin
      LogPath := RemoveBackslashUnlessRoot(GetDataDir('')) + '\install.log';
      LogText := '';
      if FileExists(LogPath) and LoadStringFromFile(LogPath, LogAnsi) then
      begin
        LogText := String(LogAnsi);
        if Length(LogText) > 700 then
          LogText := '...' + Copy(LogText, Length(LogText) - 699, 700);
      end;
      MsgBox(
        'Attention : l''installation des dépendances npm dans "' + ExpandConstant('{app}') + '" a échoué ou a été interrompue.' + #13#10 +
        'Journal : ' + LogPath + #13#10 +
        LogText + #13#10 + #13#10 +
        'Commande de réparation (PowerShell Administrateur) :' + #13#10 +
        'cd "' + ExpandConstant('{app}') + '"; npm.cmd install --include=optional',
        mbError, MB_OK);
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    RemoveDirFromMachinePath(ExpandConstant('{app}\bin'));
  end;
end;
