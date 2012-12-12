ZIP=$(shell which zip)

all:
	$(ZIP) -r cmis@moongiraffe.net.xpi bootstrap.js chrome/ chrome.manifest install.rdf ../ChangeLog ../LICENSE ../README

clean:
	$(RM) *.xpi

.PHONY: all clean
