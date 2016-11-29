/*jshint regexp:false*/
/*global unescape*/

var isUtf8RegExp = /^utf-?8$/i,
    isLatin1RegExp = /^(?:iso-8859-1|latin1)$/i,
    iconvLite = require('iconv-lite'),
    rfc2047 = module.exports = {};

function stringify(obj) {
    if (typeof obj === 'string') {
        return obj;
    } else if (obj === null || typeof obj === 'undefined') {
        return '';
    } else {
        return String(obj);
    }
}

var iconv;
try {
    iconv = require('' + 'iconv'); // Prevent browserify from detecting iconv and failing
} catch (e) {}

function decodeBuffer(encodedText, encoding) {
    if (encoding === 'q') {
        encodedText = encodedText.replace(/_/g, ' ');
        var numValidlyEncodedBytes = 0,
            i;
        for (i = 0 ; i < encodedText.length ; i += 1) {
            if (encodedText[i] === '=' && /^[0-9a-f]{2}$/i.test(encodedText.slice(i + 1, i + 3))) {
                numValidlyEncodedBytes += 1;
            }
        }
        var buffer = new Buffer(encodedText.length - numValidlyEncodedBytes * 2),
            j = 0;
        for (i = 0 ; i < encodedText.length ; i += 1) {
            if (encodedText[i] === '=') {
                var hexChars = encodedText.slice(i + 1, i + 3);
                if (/^[0-9a-f]{2}$/i.test(hexChars)) {
                    buffer[j] = parseInt(encodedText.substr(i + 1, 2), 16);
                    i += 2;
                } else {
                    buffer[j] = encodedText.charCodeAt(i);
                }
            } else {
                buffer[j] = encodedText.charCodeAt(i);
            }
            j += 1;
        }
        return buffer;
    } else {
        return new Buffer(encodedText, 'base64');
    }
}

// Returns either a string (if successful) or undefined
function decodeEncodedWord(encodedText, encoding, charset) {
    if (encoding === 'q' && isLatin1RegExp.test(charset)) {
        return unescape(encodedText.replace(/_/g, ' ').replace(/%/g, '%25').replace(/\=(?=[0-9a-f]{2})/gi, '%'));
    } else {
        var buffer;
        try {
            buffer = decodeBuffer(encodedText, encoding);
        } catch (e) {
            return;
        }
        if (/^ks_c_5601/i.test(charset)) {
            charset = 'CP949';
        }
        var decoded;
        if (iconv) {
            var converter;
            try {
                converter = new iconv.Iconv(charset, 'utf-8//TRANSLIT');
            } catch (e1) {
                // Assume EINVAL (unsupported charset) and fall back to assuming iso-8859-1:
                converter = new iconv.Iconv('iso-8859-1', 'utf-8//TRANSLIT');
            }
            try {
                return converter.convert(buffer).toString('utf-8');
            } catch (e2) {
                return;
            }
        } else if (isUtf8RegExp.test(charset)) {
            decoded = buffer.toString('utf-8');
            if (!/\ufffd/.test(decoded)) {
                return decoded;
            }
        } else if (/^(?:us-)?ascii$/i.test(charset)) {
            return buffer.toString('ascii');
        } else if (iconvLite.encodingExists(charset)) {
            decoded = iconvLite.decode(buffer, charset);
            if (!/\ufffd/.test(decoded)) {
                return decoded;
            }
        }
    }
}

var encodedWordRegExp = /\=\?([^\?]+)\?([QB])\?([^\?]*)\?=/gi;

rfc2047.decode = function (text) {
    text = stringify(text).replace(/\?\=\s+\=\?/g, '?==?'); // Strip whitespace between neighbouring encoded words

    var numEncodedWordsToIgnore = 0;

    return text.replace(encodedWordRegExp, function (encodedWord, charset, encoding, encodedText, index) {
        if (numEncodedWordsToIgnore > 0) {
            numEncodedWordsToIgnore -= 1;
            return '';
        }
        encoding = encoding.toLowerCase();
        var decodedTextOrBuffer = decodeEncodedWord(encodedText, encoding, charset);
        while (typeof decodedTextOrBuffer !== 'string') {
            // The encoded word couldn't be decoded because it contained a partial character in a multibyte charset.
            // Keep trying to look ahead and consume an additional encoded word right after this one, and if its
            // encoding and charsets match, try to decode the concatenation.

            // The ongoing replace call is unaffected by this trick, so we don't need to reset .lastIndex afterwards:
            encodedWordRegExp.lastIndex = index + encodedWord.length;
            var matchNextEncodedWord = encodedWordRegExp.exec(text);
            if (matchNextEncodedWord && matchNextEncodedWord.index === index + encodedWord.length && matchNextEncodedWord[1] === charset && matchNextEncodedWord[2].toLowerCase() === encoding) {
                numEncodedWordsToIgnore += 1;
                encodedWord += matchNextEncodedWord[0];
                encodedText += matchNextEncodedWord[3];
                decodedTextOrBuffer = decodeEncodedWord(encodedText, encoding, charset);
            } else {
                return encodedWord;
            }
        }
        return decodedTextOrBuffer;
    });
};

// Fast encoder for quoted-printable data in the "encoded-text" part of encoded words.
// This scenario differs from regular quoted-printable (as used in e.g. email bodies)
// in that the space character is represented by underscore, and fewer ASCII are
// allowed (see rfc 2047, section 2).

// Initialize array used as lookup table (int (octet) => string)
var qpTokenByOctet = new Array(256),
    i;

for (i = 0 ; i < 256 ; i += 1) {
    qpTokenByOctet[i] = "=" + (i < 16 ? "0" : "") + i.toString(16).toUpperCase();
}

"!#$%&'*+-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\\^_`abcdefghijklmnopqrstuvwxyz{|}~".split(/(?:)/).forEach(function (encodedWordSafeAsciiChar) {
    qpTokenByOctet[encodedWordSafeAsciiChar.charCodeAt(0)] = encodedWordSafeAsciiChar;
});

qpTokenByOctet[32] = "_";

function bufferToQuotedPrintableString(buffer) {
    var result = '';
    for (var i = 0 ; i < buffer.length ; i += 1) {
        result += qpTokenByOctet[buffer[i]];
    }
    return result;
}

// Build a regexp for determining whether (part of) a token has to be encoded:

var headerSafeAsciiChars = " !\"#$%&'()*+-,-./0123456789:;<=>@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
    headerUnsafeAsciiChars = "";

for (i = 0 ; i < 128 ; i += 1) {
    var ch = String.fromCharCode(i);
    if (headerSafeAsciiChars.indexOf(ch) === -1) { // O(n^2) but only happens at startup
        headerUnsafeAsciiChars += ch;
    }
}

function quoteCharacterClass(chars) {
    return chars.replace(/[\\\|\^\*\+\?\[\]\(\)\-\.]/g, "\\$&");
}

var unsafeTokenRegExp = new RegExp("[\u0080-\uffff" + quoteCharacterClass(headerUnsafeAsciiChars) + "]"),
    maxNumCharsPerEncodedWord = 8; // Very conservative limit to prevent creating an encoded word of more than 72 ascii chars

rfc2047.encode = function (text) {
    text = stringify(text)
        .replace(/\s/g, ' '); // Normalize whitespace
    var tokens = text.match(/([^\s]*\s*)/g), // Split at space, but keep trailing space as part of each token
        previousTokenWasEncodedWord = false, // Consecutive encoded words must have a space between them, so this state must be kept
        previousTokenWasWhitespaceFollowingEncodedWord = false,
        result = '';
    if (tokens) {
        for (var i = 0 ; i < tokens.length ; i += 1) {
            var token = tokens[i];
            if (unsafeTokenRegExp.test(token)) {
                var matchQuotesAtBeginning = token.match(/^"+/);
                if (matchQuotesAtBeginning) {
                    previousTokenWasEncodedWord = false;
                    result += matchQuotesAtBeginning[0];
                    tokens[i] = token = token.substr(matchQuotesAtBeginning[0].length);
                    tokens.splice(i, 0, matchQuotesAtBeginning[0]);
                    i += 1;
                }

                var matchWhitespaceOrQuotesAtEnd = token.match(/\\?[\s"]+$/);
                if (matchWhitespaceOrQuotesAtEnd) {
                    tokens.splice(i + 1, 0, matchWhitespaceOrQuotesAtEnd[0]);
                    token = token.substr(0, token.length - matchWhitespaceOrQuotesAtEnd[0].length);
                }

                // Word contains at least one header unsafe char, an encoded word must be created.
                if (token.length > maxNumCharsPerEncodedWord) {
                    tokens.splice(i + 1, 0, token.substr(maxNumCharsPerEncodedWord));
                    token = token.substr(0, maxNumCharsPerEncodedWord);
                }

                if (previousTokenWasWhitespaceFollowingEncodedWord) {
                    token = " " + token;
                }

                var charset = 'utf-8';
                // Around 25% faster than encodeURIComponent(token.replace(/ /g, "_")).replace(/%/g, "="):
                var encodedWordBody = bufferToQuotedPrintableString(new Buffer(token, 'utf-8'));
                if (previousTokenWasEncodedWord) {
                    result += ' ';
                }
                result += "=?" + charset + "?Q?" + encodedWordBody + "?=";
                previousTokenWasWhitespaceFollowingEncodedWord = false;
                previousTokenWasEncodedWord = true;
            } else {
                // Word only contains header safe chars, no need to encode:
                result += token;
                previousTokenWasWhitespaceFollowingEncodedWord = /^\s*$/.test(token) && previousTokenWasEncodedWord;
                previousTokenWasEncodedWord = false;
            }
        }
    }
    return result;
};
