/* global unescape */

const isUtf8RegExp = /^utf-?8$/i;
const isLatin1RegExp = /^(?:iso-8859-1|latin1|us-ascii)$/i;
const bufferOps = require('./node-buffer-ops');
const rfc2047 = (module.exports = {});

let iconv;
let iconvLite;

try {
  iconv = require('iconv');
} catch (e) {}

if (!iconv) {
  try {
    iconvLite = require('iconv-lite');
  } catch (e) {}
}

function stringify(obj) {
  if (typeof obj === 'string') {
    return obj;
  } else if (obj === null || typeof obj === 'undefined') {
    return '';
  } else if (obj instanceof Uint8Array) {
    return bufferOps.fromUtf8(obj);
  } else {
    return String(obj);
  }
}

function decodeBuffer(encodedText, encoding) {
  if (encoding === 'q') {
    encodedText = encodedText.replace(/_/g, ' ');
    let numValidlyEncodedBytes = 0;
    let i;
    for (i = 0; i < encodedText.length; i += 1) {
      if (
        encodedText[i] === '=' &&
        /^[0-9a-f]{2}$/i.test(encodedText.slice(i + 1, i + 3))
      ) {
        numValidlyEncodedBytes += 1;
      }
    }
    const buffer = bufferOps.allocByteBuffer(
      encodedText.length - numValidlyEncodedBytes * 2
    );
    let j = 0;
    for (i = 0; i < encodedText.length; i += 1) {
      if (encodedText[i] === '=') {
        const hexChars = encodedText.slice(i + 1, i + 3);
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
    return bufferOps.fromBase64(encodedText);
  }
}

// Returns either a string (if successful) or undefined
function decodeEncodedWord(
  encodedText,
  encoding,
  charset,
  ignoreUnknownCharset
) {
  if (encoding === 'q' && isLatin1RegExp.test(charset)) {
    return unescape(
      encodedText
        .replace(/_/g, ' ')
        .replace(/%/g, '%25')
        .replace(/=(?=[0-9a-f]{2})/gi, '%')
    );
  } else {
    let buffer;
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
      let converter;
      try {
        converter = new iconv.Iconv(charset, 'utf-8//TRANSLIT');
      } catch (e1) {
        // Assume EINVAL (unsupported charset) and fall back to assuming iso-8859-1:
        converter = new iconv.Iconv('iso-8859-1', 'utf-8//TRANSLIT');
      }
      try {
        return bufferOps.fromUtf8(converter.convert(buffer));
      } catch (e2) {}
    } else if (isUtf8RegExp.test(charset)) {
      const decoded = bufferOps.fromUtf8(buffer);
      if (
        !/\ufffd/.test(decoded) ||
        bufferOps.includesReplacementCharacter(buffer)
      ) {
        return decoded;
      }
    } else if (isLatin1RegExp.test(charset)) {
      return bufferOps.fromAscii(buffer);
    } else if (iconvLite && iconvLite.encodingExists(charset)) {
      decoded = iconvLite.decode(buffer, charset);
      if (
        !/\ufffd/.test(decoded) ||
        bufferOps.includesReplacementCharacter(buffer)
      ) {
        return decoded;
      }
    } else if (!ignoreUnknownCharset) {
      throw new RangeError(`unsupported charset ${charset}`);
    }
  }
}

const encodedWordRegExp = /=\?([^?]+)\?([QB])\?([^?]*)\?=/gi;

rfc2047.decode = (text, options) => {
  if (options === undefined) {
    options = {
      ignoreUnknownCharset: true,
    };
  }
  text = stringify(text).replace(/\?=\s+=\?/g, '?==?'); // Strip whitespace between neighbouring encoded words

  let numEncodedWordsToIgnore = 0;

  return text.replace(
    encodedWordRegExp,
    (encodedWord, charset, encoding, encodedText, index) => {
      if (numEncodedWordsToIgnore > 0) {
        numEncodedWordsToIgnore -= 1;
        return '';
      }
      encoding = encoding.toLowerCase();
      let decodedTextOrBuffer = decodeEncodedWord(
        encodedText,
        encoding,
        charset,
        options.ignoreUnknownCharset
      );
      while (typeof decodedTextOrBuffer !== 'string') {
        // The encoded word couldn't be decoded because it contained a partial character in a multibyte charset.
        // Keep trying to look ahead and consume an additional encoded word right after this one, and if its
        // encoding and charsets match, try to decode the concatenation.

        // The ongoing replace call is unaffected by this trick, so we don't need to reset .lastIndex afterwards:
        encodedWordRegExp.lastIndex = index + encodedWord.length;
        const matchNextEncodedWord = encodedWordRegExp.exec(text);
        if (
          matchNextEncodedWord &&
          matchNextEncodedWord.index === index + encodedWord.length &&
          matchNextEncodedWord[1] === charset &&
          matchNextEncodedWord[2].toLowerCase() === encoding
        ) {
          numEncodedWordsToIgnore += 1;
          encodedWord += matchNextEncodedWord[0];
          encodedText += matchNextEncodedWord[3];
          decodedTextOrBuffer = decodeEncodedWord(
            encodedText,
            encoding,
            charset,
            options.ignoreUnknownCharset
          );
        } else {
          return encodedWord;
        }
      }
      return decodedTextOrBuffer;
    }
  );
};

// Fast encoder for quoted-printable data in the "encoded-text" part of encoded words.
// This scenario differs from regular quoted-printable (as used in e.g. email bodies)
// in that the space character is represented by underscore, and fewer ASCII are
// allowed (see rfc 2047, section 2).

// Initialize array used as lookup table (int (octet) => string)
const qpTokenByOctet = new Array(256);
let i;

for (i = 0; i < 256; i += 1) {
  qpTokenByOctet[i] = `=${i < 16 ? '0' : ''}${i.toString(16).toUpperCase()}`;
}

for (const encodedWordSafeAsciiChar of "!#$%&'*+-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\\^`abcdefghijklmnopqrstuvwxyz{|}~".split(
  /(?:)/
)) {
  qpTokenByOctet[encodedWordSafeAsciiChar.charCodeAt(0)] =
    encodedWordSafeAsciiChar;
}

qpTokenByOctet[32] = '_';

function bufferToQuotedPrintableString(buffer) {
  let result = '';
  for (let i = 0; i < buffer.length; i += 1) {
    result += qpTokenByOctet[buffer[i]];
  }
  return result;
}

// Build a regexp for determining whether (part of) a token has to be encoded:

const headerSafeAsciiChars =
  ' !"#$%&\'()*+-,-./0123456789:;<=>@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
let headerUnsafeAsciiChars = '';

for (i = 0; i < 128; i += 1) {
  const ch = String.fromCharCode(i);
  if (!headerSafeAsciiChars.includes(ch)) {
    // O(n^2) but only happens at startup
    headerUnsafeAsciiChars += ch;
  }
}

function quoteCharacterClass(chars) {
  return chars.replace(/[\\|^*+?[\]().-]/g, '\\$&');
}

const unsafeTokenRegExp = new RegExp(
  `[\u0080-\uffff${quoteCharacterClass(headerUnsafeAsciiChars)}]`
);
const maxNumCharsPerEncodedWord = 8; // Very conservative limit to prevent creating an encoded word of more than 72 ascii chars

rfc2047.encode = (text) => {
  text = stringify(text).replace(/\s/g, ' '); // Normalize whitespace
  const tokens = text.match(/([^\s]*\s*)/g); // Split at space, but keep trailing space as part of each token
  let previousTokenWasEncodedWord = false; // Consecutive encoded words must have a space between them, so this state must be kept
  let previousTokenWasWhitespaceFollowingEncodedWord = false;
  let result = '';
  if (tokens) {
    for (let i = 0; i < tokens.length; i += 1) {
      let token = tokens[i];
      if (unsafeTokenRegExp.test(token)) {
        const matchQuotesAtBeginning = token.match(/^"+/);
        if (matchQuotesAtBeginning) {
          previousTokenWasEncodedWord = false;
          result += matchQuotesAtBeginning[0];
          tokens[i] = token = token.substr(matchQuotesAtBeginning[0].length);
          tokens.splice(i, 0, matchQuotesAtBeginning[0]);
          i += 1;
        }

        const matchWhitespaceOrQuotesAtEnd = token.match(/\\?[\s"]+$/);
        if (matchWhitespaceOrQuotesAtEnd) {
          tokens.splice(i + 1, 0, matchWhitespaceOrQuotesAtEnd[0]);
          token = token.substr(
            0,
            token.length - matchWhitespaceOrQuotesAtEnd[0].length
          );
        }

        // Word contains at least one header unsafe char, an encoded word must be created.
        if (token.length > maxNumCharsPerEncodedWord) {
          tokens.splice(i + 1, 0, token.substr(maxNumCharsPerEncodedWord));
          token = token.substr(0, maxNumCharsPerEncodedWord);
        }

        if (previousTokenWasWhitespaceFollowingEncodedWord) {
          token = ` ${token}`;
        }

        const charset = 'utf-8';
        // Around 25% faster than encodeURIComponent(token.replace(/ /g, "_")).replace(/%/g, "="):
        const encodedWordBody = bufferToQuotedPrintableString(
          bufferOps.toUtf8(token)
        );
        if (previousTokenWasEncodedWord) {
          result += ' ';
        }
        result += `=?${charset}?Q?${encodedWordBody}?=`;
        previousTokenWasWhitespaceFollowingEncodedWord = false;
        previousTokenWasEncodedWord = true;
      } else {
        // Word only contains header safe chars, no need to encode:
        result += token;
        previousTokenWasWhitespaceFollowingEncodedWord =
          /^\s*$/.test(token) && previousTokenWasEncodedWord;
        previousTokenWasEncodedWord = false;
      }
    }
  }
  return result;
};
