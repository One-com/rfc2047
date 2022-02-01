const replacementCharacterBuffer = new Uint8Array([0xef, 0xbf, 0xbd]);

module.exports = {
  fromBase64: (b64str) => {
    return Buffer.from(b64str, 'base64');
  },

  toUtf8: (str) => {
    return Buffer.from(str, 'utf-8');
  },
  fromUtf8: String,
  fromAscii: (buffer) => {
    return buffer.toString('ascii');
  },

  allocByteBuffer: Buffer.alloc,

  includesReplacementCharacter: (haystack) => {
    return haystack.includes(replacementCharacterBuffer);
  },
};
