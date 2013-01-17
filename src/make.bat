@echo off

del "cmis@moongiraffe.net.xpi"

"C:\Program Files\7-zip\7z.exe" a -r -tzip cmis@moongiraffe.net.xpi bootstrap.js content/ chrome.manifest ChangeLog install.rdf LICENSE locale/ skin/

"C:\Program Files (x86)\Mozilla Firefox\firefox.exe" cmis@moongiraffe.net.xpi
