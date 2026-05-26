Dim fso, scriptFolder, WshShell
Set fso = CreateObject("Scripting.FileSystemObject")
scriptFolder = fso.GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd.exe /c """ & scriptFolder & "\start_bot.bat""", 0, false
