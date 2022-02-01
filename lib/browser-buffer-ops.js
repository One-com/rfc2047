const replacementCharacterBuffer = new Uint8Array([0xef, 0xbf, 0xbd]);

const base64js = require('base64-js');

module.exports = {
  fromBase64: (b64str) => {
    try {
      return base64js.toByteArray(b64str);
    } catch (e) {
      return new Uint8Array();
    }
  },

  toUtf8: TextEncoder.prototype.encode.bind(new TextEncoder()),
  fromUtf8: TextDecoder.prototype.decode.bind(new TextDecoder()),
  fromAscii: TextDecoder.prototype.decode.bind(new TextDecoder('ascii')),

  allocByteBuffer: (length) => {
    return new Uint8Array(length);
  },

  includesReplacementCharacter: (haystack) => {
    const needle = replacementCharacterBuffer;
    if (haystack.length < needle.length) {
      return false;
    }
    let fromIndex = 0;
    while (fromIndex !== haystack.length - 3) {
      const foundFirst = haystack[fromIndex] === needle[0];
      const foundSecond = haystack[fromIndex + 1] === needle[1];
      const foundThird = haystack[fromIndex + 2] === needle[2];

      if (foundFirst && foundSecond && foundThird) {
        return true;
      } else {
        fromIndex += 1;
      }
    }

    return false;
  },
};
