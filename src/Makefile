ZIP=$(shell which zip)

XPI=cmis@moongiraffe.net.xpi

all: zip

install: zip
	firefox $(XPI) &

zip:
	$(ZIP) -r $(XPI) bootstrap.js chrome/ chrome.manifest install.rdf ../ChangeLog ../LICENSE ../README

clean:
	$(RM) $(XPI)

.PHONY: clean
