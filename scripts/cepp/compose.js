// Retrieving all elements by their id's:
const serialNumber = document.getElementById('serialNumber');
const issuer = document.getElementById('issuer');
const issuerEncryptionDetails = document.getElementById('issuerEncryptionDetails');
const notBeforeDate = document.getElementById('notBeforeDate');
const notBeforeTime = document.getElementById('notBeforeTime');
const notAfterDate = document.getElementById('notAfterDate');
const notAfterTime = document.getElementById('notAfterTime');
const subjectDomain = document.getElementById('subjectDomain');
const attachCertificateButton = document.getElementById('attachCertificateButton');
const attachCertificateResult = document.getElementById('attachCertificateResult');

// Setting a random Serial Number:
serialNumber.value = Math.floor(Math.random() * 10E15);

// Setting a default Issuer & set details:
for (const key in caPrivateKeys) {
    issuer.options[issuer.options.length] = new Option(key);
}
updateIssuerEncryptionDetails();
issuer.addEventListener("change", () => updateIssuerEncryptionDetails());

function updateIssuerEncryptionDetails() {
    issuerEncryptionDetails.textContent = JSON.stringify(caPrivateKeys[issuer.value]);
}

// Setting an example Validity Period:
const date = new Date();
date.setDate(date.getDate() - 1);
notBeforeDate.value = date.toISOString().slice(0, 10);
notBeforeTime.value = date.toISOString().slice(11, 16)
date.setDate(date.getDate() + 8);
notAfterDate.value = date.toISOString().slice(0, 10);
notAfterTime.value = date.toISOString().slice(11, 16)

// Setting the current Subject Domain:
getCurrentEmailAddress().then(address => {
    if (address == null) return;
    subjectDomain.value = address.split('@')[1];
});

// Add a button for attaching the certificate:
attachCertificateButton.addEventListener("click", () => {
    // Initialize values
    const success = '#52ff4c';
    const failure = '#ff4c4c';

    // Util function to check element validity
    const checkValidity = element => {
        const valid = element.value.length > 0;
        element.style.borderColor = valid ? success : failure;
        return valid;
    };

    // Check that all input fields are correct
    const serialNumberValid = !isNaN(serialNumber.value) && serialNumber.value.length > 0;
    serialNumber.style.borderColor = serialNumberValid ? success : failure;
    // The issuer is always correct (Since it's a choose box)
    issuer.style.borderColor = success;
    // Check validity for all remaining default elements
    const notBeforeDateValid = checkValidity(notBeforeDate);
    const notBeforeTimeValid = checkValidity(notBeforeTime);
    const notAfterDateValid = checkValidity(notAfterDate);
    const notAfterTimeValid = checkValidity(notAfterTime);
    const subjectDomainValid = checkValidity(subjectDomain);
    // Check whether all of them were correctly entered
    const allSuccess = serialNumberValid && notBeforeDateValid && notBeforeTimeValid
        && notAfterDateValid && notAfterTimeValid && subjectDomainValid;

    // If all were correctly entered, add the certificate to the mail.
    // Send a message containing info whether input was correct.
    if (allSuccess) {
        getCurrentTabId().then(tabId => {
            if (tabId == null) return;

            const certificateData = {
                'v': '1',
                's': serialNumber.value,
                'a': caPrivateKeys[issuer.value].algorithm,
                'i': issuer.value,
                'nb': notBeforeDate.value.replaceAll('-', '').substring(2) +
                    notBeforeTime.value.replaceAll(':', '') + '00Z',
                'na': notAfterDate.value.replaceAll('-', '').substring(2) +
                    notAfterTime.value.replaceAll(':', '') + '00Z',
                'd': subjectDomain.value,
                'l': '2'
            }

            // Add the certificate headers to the e-mail headers
            messenger.composeMessageHeaders.addComposeHeader(tabId, 'CEPP-Data',
                createCertificateDataString(certificateData));
            messenger.composeMessageHeaders.addComposeHeader(tabId, 'CEPP-Signature',
                generateCertificateSignature(certificateData));

            attachCertificateResult.innerText = 'Certificate added to e-mail!';
        });
    } else {
        attachCertificateResult.innerText = 'Failed to add certificate.';
    }
});

/**
 * Returns a promise that delivers the currently opened ThunderBird tab ID, or null of no such tab is available
 * @returns {Promise<Number|Null>} A promise that delivers the ID of the tab that is currently opened by Thunderbird
 */
function getCurrentTabId() {
    return new Promise(resolve => {
        // Retrieve the current tab
        messenger.tabs.query({active: true, currentWindow: true}).then(tabs => {
            // If we failed to get the current tab for some reason, return null
            if (tabs.length === 0) {
                resolve(null);
                return;
            }
            const tab = tabs[0];
            resolve(tab.id);
        });
    });
}

/**
 * Returns a promise containing the e-mail address that is displayed in the currently opened Thunderbird compose tab
 * If no tab is available, or the tab is not a compose tab, this function returns null
 * @returns {Promise<String|Null>} The e-mail address that is displayed in the opened Thunderbird compose tab
 */
function getCurrentEmailAddress() {
    return new Promise(resolve => {
        // Retrieve the current tab
        getCurrentTabId().then(tabId => {
            if (tabId == null) {
                resolve(null);
                return;
            }

            // Retrieve the compose details from the current tab
            messenger.compose.getComposeDetails(tabId).then(details => {
                // Retrieve the ID of the currently used account
                const id = details.identityId;
                // Loop through all user acounts to find the account with the id
                messenger.accounts.list().then(accounts => {
                    accounts.forEach(account => {
                        account.identities.forEach(identity => {
                            if (identity.id === id) {
                                resolve(account.name);
                            }
                        });
                    });
                    resolve(null);
                });
            });
        });
    });
}