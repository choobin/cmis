@echo off

if exist "cmis@moongiraffe.net.xpi" (
   del "cmis@moongiraffe.net.xpi"
)

if exist "C:\Program Files\7-zip\7z.exe" (
    set zip="C:\Program Files\7-zip\7z.exe"
) else (
    set zip="C:\Program Files (x86)\7-zip\7z.exe"
)

if exist "C:\Program Files\Mozilla Firefox\firefox.exe" (
    set firefox="C:\Program Files\Mozilla Firefox\firefox.exe"
) else (
    set firefox="C:\Program Files (x86)\Mozilla Firefox\firefox.exe"
)

%zip% a -r -tzip cmis@moongiraffe.net.xpi bootstrap.js content/ chrome.manifest ../ChangeLog install.rdf lib/ ../LICENSE locale/ skin/

%firefox% cmis@moongiraffe.net.xpi
