ZIP=$(shell which zip)

XPI=cmis@moongiraffe.net.xpi

all: clean zip

install: zip
	firefox $(XPI) &

zip:
	$(ZIP) -r $(XPI) bootstrap.js content/ locale/ skin/ chrome.manifest install.rdf ../ChangeLog ../LICENSE ../README

clean:
	$(RM) $(XPI)

.PHONY: clean
