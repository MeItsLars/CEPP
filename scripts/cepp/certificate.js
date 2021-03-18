const EC = require('elliptic').ec;

/**
 * Generates a certificate signature from given certificate data.
 * @param {Object} certificateData The certificate data object
 * @returns {null|String}          The signature if the certificate data was valid, null otherwise
 */
function generateCertificateSignature(certificateData) {
    // Choose which implementation to take based on the certificate algorithm
    switch (certificateData.a) {
        case 'ecdsa':
            return generateECDSACertificateSignature(certificateData);
        default:
            return null;
    }
}

/**
 * Generates an ECDSA signature given certificate data.
 * @param {Object}   certificateData
 * @returns {String} The signature
 */
function generateECDSACertificateSignature(certificateData) {
    const parameters = caPrivateKeys[certificateData.i].parameters;

    // Initialize a new ECDSA instance from the parameters
    const ec = new EC(parameters.curve);

    // Parse the ECDSA key from the parameters
    const key = ec.keyFromPrivate(parameters["private-key"], 'hex');

    // Sign the input with the key and return the result
    return key.sign(createCertificateDataString(certificateData)).toDER('hex');
}

/**
 * Verifies a CEPP signature given its data and signature headers.
 * @param {String} certificateDataString The content of the CEPP-Data header
 * @param {String} signature             The content of the CEPP-Signature header
 * @returns {boolean}                    True if the signature was valid, false otherwise
 */
function verifyCertificateSignature(certificateDataString, signature) {
    // Parse and check the certificate data
    const certificateData = parseCertificateDataString(certificateDataString);
    if (certificateData == null) return false;

    switch (certificateData.a) {
        case 'ecdsa':
            return verifyECDSACertificate(certificateData, certificateDataString, signature);
        default:
            return false;
    }
}

/**
 * Verifies an ECDSA CEPP signature given its data and signature headers
 * @param {Object} certificateData       The parsed certificate data object
 * @param {String} certificateDataString The content of the CEPP-Data header
 * @param {String} signature             The content of the CEPP-Signature header
 * @returns {boolean}                    True if the signature was valid, false otherwise
 */
function verifyECDSACertificate(certificateData, certificateDataString, signature) {
    // We use a try-catch to make sure that, if the certificate signature was forged, the output is still 'false'
    try {
        // Check that the given certificate authority is trusted
        const caData = trusted_ca_public_keys[certificateData.i];
        if (caData == null) return false;
        const parameters = caData.parameters;

        // Initialize a new ECDSA instance from the parameters
        const ec = new EC(parameters.curve);

        // Parse the ECDSA key from the parameters
        const key = ec.keyFromPublic(parameters["public-key"], 'hex');

        // Verify and return the result
        return key.verify(certificateDataString, signature);
    } catch (err) {
        console.error(err);
        return false;
    }
}

/**
 * Creates a certificate data string given a certificate data object
 * @param {Object} certificateData The certificate data object
 * @returns {string}               The formatted certificate data string
 */
function createCertificateDataString(certificateData) {
    return `v=${certificateData.v}; s=${certificateData.s}; a=${certificateData.a}; i=${certificateData.i};` +
        ` nb=${certificateData.nb}; na=${certificateData.na}; d=${certificateData.d}; l=${certificateData.l}`;
}

// An array holding the expected order of certificate data parameters
const expectedOrder = ['v', 's', 'a', 'i', 'nb', 'na', 'd', 'l'];

/**
 * Secure method for parsing a CEPP data header and returning an object containing all CEPP details.
 * If the header was malformed, this function will return null.
 * @param {String} input The content of the CEPP-Data header
 * @returns {Object}     An object containing the parsed string if parsing succeeded, or null if parsing failed
 */
function parseCertificateDataString(input) {
    // Split the parameters
    const args = input.split(';');
    let i = 0;
    // Check that the parameter count is exactly the expected amount of parameters
    if (args.length !== expectedOrder.length) return null;

    const result = {};

    // Loop through all expected parameters, and add them to the result
    for (const expectedKey of expectedOrder) {
        const arg = args[i++];
        const argParts = arg.split('=');
        // If the formatting was not a=b or the key was not equal to the expected key, fail
        if (argParts.length !== 2 || argParts[0].trim() !== expectedKey) return null;
        result[expectedKey] = argParts[1];
    }

    return result;
}