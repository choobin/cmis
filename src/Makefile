ZIP=$(shell which zip)

XPI=cmis@moongiraffe.net.xpi

all: clean zip

install: zip
	firefox $(XPI) &

zip:
	$(ZIP) -r $(XPI) bootstrap.js content/ lib/ locale/ skin/ chrome.manifest install.rdf ../ChangeLog ../LICENSE ../README

clean:
	-$(RM) $(XPI) > /dev/null 2>&1

.PHONY: clean
