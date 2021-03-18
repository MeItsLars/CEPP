/**
 * Given a unique e-mail ID, returns a promise that delivers the parsed CEPP header, or null if the header was
 * not available or invalid.
 * @param {Number} messageId         The ID of the e-mail that we want to get the CEPP header from
 * @returns {Promise<Object|Number>} A promise containing the parsed CEPP data, or null
 */
function getCEPPData(messageId) {
    return new Promise((resolve, reject) => {
        messenger.messages.getFull(messageId).then(messagePart => {
            messenger.messages.get(messageId).then(messageHeader => {
                const ceppData = messagePart.headers['cepp-data'];
                const ceppSignature = messagePart.headers['cepp-signature'];

                if (!(ceppData && ceppSignature && ceppData.length === 1 && ceppSignature.length === 1)) {
                    // No CEPP signature available
                    reject(-1);
                    return;
                }

                const certificateData = parseCertificateDataString(ceppData[0]);
                if (certificateData == null) {
                    // Invalid certificate data
                    reject(-2);
                    return;
                }

                if (!verifyCertificateData(certificateData, messageHeader.author)) {
                    // Invalid CEPP certificate data
                    reject(-2);
                    return;
                }

                if (!verifyCertificateSignature(ceppData[0], ceppSignature[0])) {
                    // Invalid CEPP certificate
                    reject(-2);
                    return;
                }

                // If all checks passed, the mail is CEPP protected
                resolve(certificateData);
            });
        });
    });
}

// We add an event listener that checks when a new message display tab is opened in Thunderbird.
// When this happens, this listener will attempt to retrieve the CEPP data and display the validity.
messenger.messageDisplay.onMessageDisplayed.addListener((tab, message) => {
    getCEPPData(message.id).then(result => {
        showMessageResult(tab.id, 0);
    }, error => {
        showMessageResult(tab.id, error);
    });
});

/**
 * Given a Thunderbird tab and a CEPP header validity code, injects a script into the given tab that alters the
 * looks of that tab to indicate the trustworthiness
 * @param {Object} tab       The Thunderbird tab
 * @param {Number} validCode The CEPP header validity code
 */
function showMessageResult(tab, validCode) {
    messenger.tabs.executeScript(tab.id, { file: 'scripts/cepp/mail_display_injections/default.js' });

    // Set a file path based on the validity code
    let filePath;
    switch (validCode) {
        case 0:
            filePath = 'scripts/cepp/mail_display_injections/mail_valid.js';
            break;
        case -1:
            filePath = 'scripts/cepp/mail_display_injections/mail_invalid_no_header.js';
            break;
        case -2:
            filePath = 'scripts/cepp/mail_display_injections/mail_invalid_incorrect.js';
            break;
    }

    // Inject the file into the tab
    messenger.tabs.executeScript(tab.id, {file: filePath});
}

/**
 * Given a certificate data object and a sender domain, validates the certificate data (not signature)
 * @param {Object} certificateData The CEPP certificate data object
 * @param {String} domain          The sender of the e-mail
 * @returns {boolean}              True if the certificate data was valid, false otherwise
 */
function verifyCertificateData(certificateData, domain) {
    // Create a string for the current date
    const date = new Date();
    const dateString = date.getFullYear().toString().substring(2)
        + ('0' + (date.getMonth().toString() + 1)).slice(-2)
        + ('0' + date.getDay().toString()).slice(-2)
        + ('0' + date.getHours().toString()).slice(-2)
        + ('0' + date.getMinutes().toString()).slice(-2)
        + ('0' + date.getSeconds().toString()).slice(-2)
        + 'Z';

    // Check certificate version and serial number:
    if (certificateData.v !== '1' || isNaN(certificateData.s)) {
        return false;
    }

    // Check the date correctness of the certificate
    if (!checkDates(certificateData.nb, dateString, certificateData.na)) {
        return false;
    }

    // Check the domain and sender correctness
    const domainParts = domain.split('@');
    if (domainParts.length !== 2) return false;

    let mailDomain = domainParts[1];
    if (domainParts[1].endsWith('>') && domainParts[1].length > 1) {
        mailDomain = domainParts[1].substring(0, domainParts[1].length - 1);
    }
    return certificateData.d === mailDomain;
}

/**
 * Given three CEPP-formatted date strings, checks if the first date is before the second date, and the second date
 * before the third
 * @param {String} before  The 'before' date
 * @param {String} current The 'current' date
 * @param {String} after   The 'after' date
 * @returns {boolean}      True if 'before <= current <= after', false otherwise
 */
function checkDates(before, current, after) {
    // Check that the before and after date strings are formatted correctly.
    // We don't need to check the current date string, since we can be sure that that string is already correct.
    if (before.length !== 13 || after.length !== 13 ||
        isNaN(before.substring(0, 12)) || isNaN(after.substring(0, 12))) {
        return false;
    }

    // Validate and return
    return parseInt(before.substring(0, 12)) < parseInt(current.substring(0, 12))
        || parseInt(after.substring(0, 12)) > parseInt(current.substring(0, 12));
}

/**
 * Opens an e-mail compose window with a copy of the e-mail that is currently being watched, with the purpose
 * of reporting a spam e-mail
 */
async function onSpamReportButtonClicked() {
    // Get the current tab
    messenger.tabs.query({active: true, currentWindow: true}).then(tabs => {
        if (tabs.length !== 1) return;
        const tab = tabs[0];

        // Get the currently displayed message
        messenger.messageDisplay.getDisplayedMessage(tab.id).then(messageHeader => {
            // Get the CEPP data of the currently displayed message
            getCEPPData(messageHeader.id).then(certificateData => {
                // If the CEPP data was correct, retrieve the responsible CA's spam e-mail
                const caData = trusted_ca_public_keys[certificateData.i];
                if (caData == null) return;
                const spamMail = caData['spam'];

                // Retrieve the raw e-mail content of the currently watched e-mail
                messenger.messages.getRaw(messageHeader.id).then(messageString => {
                    // Construct a new e-mail (the spam report)
                    messenger.compose.beginNew({
                        to: spamMail,
                        subject: 'Spam Report for trusted source.',
                        body: messageString
                    });
                });
            }, error => {
                // Do nothing
            });
        });
    });
}

// Add a spam report button listener to the message display
messenger.messageDisplayAction.onClicked.addListener(onSpamReportButtonClicked);