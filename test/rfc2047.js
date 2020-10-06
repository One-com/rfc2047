/*global describe, it*/
var unexpected = require('unexpected'),
    rfc2047 = require('../lib/rfc2047');

describe('rfc2047', function () {
    var expect = unexpected.clone().addAssertion('to encode to', function (expect, subject, value) {
        expect(rfc2047.encode(subject), 'to equal', value);
    }).addAssertion('to decode to', function (expect, subject, value) {
        expect(rfc2047.decode(subject), 'to equal', value);
    }).addAssertion('to encode back and forth to', function (expect, subject, value) {
        expect(subject, 'to encode to', value);
        expect(value, 'to decode to', subject);
    });

    describe('#encode() and #decode()', function () {
        it('should handle the empty string', function () {
            expect('', 'to encode back and forth to', '');
        });

        it('should handle a string only containing a space', function () {
            expect(' ', 'to encode back and forth to', ' ');
        });

        it('should not encode an equals sign', function () {
            expect('=', 'to encode back and forth to', '=');
        });

        it('should handle a string that does not need to be encoded', function () {
            expect('Andreas Lind <andreas@one.com>', 'to encode back and forth to', 'Andreas Lind <andreas@one.com>');
        });

        it('should handle a multi-word string where the middle word has to be encoded', function () {
            expect('Andreas Lindø <andreas@one.com>', 'to encode back and forth to', 'Andreas =?utf-8?Q?Lind=C3=B8?= <andreas@one.com>');
        });

        it('should use an UTF-8 encoded word when a character is not in iso-8859-1', function () {
            expect('Mr. Smiley face aka ☺ <smiley@face.dk>', 'to encode back and forth to', 'Mr. Smiley face aka =?utf-8?Q?=E2=98=BA?= <smiley@face.dk>');
        });

        it('should handle two neighbouring words that have to be encoded', function () {
            expect('¡Hola, señor!', 'to encode back and forth to', '=?utf-8?Q?=C2=A1Hola=2C?= =?utf-8?Q?_se=C3=B1or!?=');
            expect('På lördag', 'to encode back and forth to', '=?utf-8?Q?P=C3=A5?= =?utf-8?Q?_l=C3=B6rdag?=');
        });

        it('should not rely on the space between neighbouring encoded words to be preserved', function () {
            expect('☺ ☺', 'to encode back and forth to', '=?utf-8?Q?=E2=98=BA?= =?utf-8?Q?_=E2=98=BA?=');
        });

        it('should handle some dreamed up edge cases', function () {
            expect('lördag', 'to encode back and forth to', '=?utf-8?Q?l=C3=B6rdag?=');
        });

        it('should handle a multi-word string where the middle word has to be left unencoded', function () {
            expect('Så er fødselen i gang', 'to encode back and forth to', '=?utf-8?Q?S=C3=A5?= er =?utf-8?Q?f=C3=B8dselen?= i gang');
        });

        it('should place leading quotes correctly', function () {
            expect('"ÅÄÖ" <sss@example.com>', 'to encode back and forth to', '"=?utf-8?Q?=C3=85=C3=84=C3=96?=" <sss@example.com>');
        });

        it('should place trailing quotes correctly', function () {
            expect('"TEST ÅÄÖ" <sss@example.com>', 'to encode back and forth to', '"TEST =?utf-8?Q?=C3=85=C3=84=C3=96?=" <sss@example.com>');
        });

        // Regression test for #2:
        it('should handle an emoji test case', function () {
            expect('{"tags":"","fullName":"😬"}', 'to encode back and forth to', '=?utf-8?Q?{=22tags=22=3A?=""=?utf-8?Q?=2C=22fullNa?= =?utf-8?Q?me=22=3A=22=F0=9F=98=AC=22?=}');
        });

        it('should handle the replacement character', function () {
            expect('test_�.docx', 'to encode back and forth to', '=?utf-8?Q?test=5F=EF=BF=BD=2Ed?=ocx');
        });
    });

    describe('#encode()', function () {
        it('should handle non-string values correctly', function () {
            expect(-1, 'to encode to', '-1');
            expect(Infinity, 'to encode to', 'Infinity');
            expect(false, 'to encode to', 'false');
            expect(true, 'to encode to', 'true');
            expect(/bla/, 'to encode to', '/bla/');
            expect(undefined, 'to encode to', '');
            expect(null, 'to encode to', '');
        });

        it('should handle a tab character at the beginning of a word', function () {
            expect('\tfoo', 'to encode to', ' foo');
        });

        it('should handle control chars', function () {
            expect(
                '\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f',
                'to encode to',
                '=?utf-8?Q?=00=01=02=03=04=05=06=07?= =?utf-8?Q?=08?=     =?utf-8?Q?_=0E=0F=10=11=12=13=14=15?= =?utf-8?Q?=16=17=18=19=1A=1B=1C=1D?= =?utf-8?Q?=1E=1F?='
            );
        });

        it('should handle a tab character at the end of a word', function () {
            expect('foo\t', 'to encode to', 'foo ');
        });

        it('should handle a tab character with spaces around it', function () {
            expect('bar \t foo', 'to encode to', 'bar   foo');
        });

        it('should not split a backslash from the doublequote it is escaping', function () {
            expect('"Öland\\""', 'to encode to', '"=?utf-8?Q?=C3=96land?=\\""');
        });
    });

    describe('#decode()', function () {
        it('should handle non-string values correctly', function () {
            expect(-1, 'to decode to', '-1');
            expect(Infinity, 'to decode to', 'Infinity');
            expect(false, 'to decode to', 'false');
            expect(true, 'to decode to', 'true');
            expect(/bla/, 'to decode to', '/bla/');
            expect(undefined, 'to decode to', '');
            expect(null, 'to decode to', '');
        });

        it('should decode encoded word with invalid quoted-printable, decodeURIComponent case', function () {
            expect('=?UTF-8?Q?=xxfoo?=', 'to decode to', '=xxfoo');
        });

        it('should decode encoded word with invalid quoted-printable, unescape case', function () {
            expect('=?iso-8859-1?Q?=xxfoo?=', 'to decode to', '=xxfoo');
        });

        it('should decode encoded word with invalid base64', function () {
            expect('=?iso-8859-1?B?\u0000``?=', 'to decode to', '');
        });

        it('should decode separated encoded words', function () {
            expect(
                '=?utf-8?Q?One.com=E2=80?= =?utf-8?Q?=99s_=E2=80=9CDon=E2=80=99t_screw_it_up=E2=80=9D_?= =?utf-8?Q?code?=',
                'to decode to',
                'One.com’s “Don’t screw it up” code'
            );
        });

        it('should handle the test cases listed in RFC 2047', function () {
            expect('=?ISO-8859-1?Q?Olle_J=E4rnefors?= <ojarnef@admin.kth.se>', 'to decode to', 'Olle Järnefors <ojarnef@admin.kth.se>');
            expect('=?ISO-8859-1?Q?Patrik_F=E4ltstr=F6m?= <paf@nada.kth.se>', 'to decode to', 'Patrik Fältström <paf@nada.kth.se>');
            expect('Nathaniel Borenstein <nsb@thumper.bellcore.com> (=?iso-8859-8?b?7eXs+SDv4SDp7Oj08A==?=)', 'to decode to', 'Nathaniel Borenstein <nsb@thumper.bellcore.com> (םולש ןב ילטפנ)');
            expect('(=?ISO-8859-1?Q?a?=)', 'to decode to', '(a)');
            expect('(=?ISO-8859-1?Q?a?= b)', 'to decode to', '(a b)');
            expect('(=?ISO-8859-1?Q?a?= =?ISO-8859-1?Q?b?=)', 'to decode to', '(ab)');
            expect('(=?ISO-8859-1?Q?a?=  =?ISO-8859-1?Q?b?=)', 'to decode to', '(ab)');
            expect('(=?ISO-8859-1?Q?a_b?=)', 'to decode to', '(a b)');
            expect('(=?ISO-8859-1?Q?a?= =?ISO-8859-2?Q?_b?=)', 'to decode to', '(a b)');
        });

        it('should handle subject found in mail with X-Mailer: MailChimp Mailer', function () {
            expect('=?utf-8?Q?Spar=2020=20%=20p=C3=A5=20de=20bedste=20businessb=C3=B8ger=20fra=20Gyldendal=21?=', 'to decode to', 'Spar 20 % på de bedste businessbøger fra Gyldendal!');
            expect('=?iso-8859-1?Q?Spar 20 %...?=', 'to decode to', 'Spar 20 %...');
        });

        it('should handle multiple base64 encoded words issued by Thunderbird', function () {
            expect(
                '=?UTF-8?B?Rm9vw6YsIEZvbyDDpiwgw6bDuMOmw7jDpsO4w6bDuMOmw7jDpsO4LCA=?==?UTF-8?B?4pi6IE1y4pi6IOKYuuKYuuKYuuKYuuKYuuKYuuKYuuKYuuKYuuKYuuKYuuKYuuKYug==?= =?UTF-8?B?4pi64pi64pi64pi64pi64pi64pi6?=',
                'to decode to',
                'Fooæ, Foo æ, æøæøæøæøæøæø, ☺ Mr☺ ☺☺☺☺☺☺☺☺☺☺☺☺☺☺☺☺☺☺☺☺'
            );
        });

        it('should handle two back-to-back UTF-8 encoded words from the subject in a raygun mail', function () {
            expect('=?utf-8?B?d2VibWFpbCBwcm9kdWN0aW9uIC0gbmV3IGVycm9yIC0gR2XD?==?utf-8?B?p2Vyc2l6IGRlxJ9pxZ9rZW4u?=', 'to decode to', 'webmail production - new error - Geçersiz değişken.');
        });

        it('should keep encoded words with partial sequences separate if there is text between them', function () {
            expect('=?utf-8?B?d2VibWFpbCBwcm9kdWN0aW9uIC0gbmV3IGVycm9yIC0gR2XD?=foo=?utf-8?B?p2Vyc2l6IGRlxJ9pxZ9rZW4u?=', 'to decode to', '=?utf-8?B?d2VibWFpbCBwcm9kdWN0aW9uIC0gbmV3IGVycm9yIC0gR2XD?=foo=?utf-8?B?p2Vyc2l6IGRlxJ9pxZ9rZW4u?=');
        });

        it('should decode a UTF-8 smiley (illegally) split up into 2 encoded words', function () {
            expect('=?utf-8?Q?=E2=98?= =?utf-8?Q?=BA?=', 'to decode to', '☺');
        });

        it('should decode a UTF-8 smiley (illegally) split up into 3 encoded words', function () {
            expect('=?utf-8?Q?=E2?= =?utf-8?Q?=98?= =?utf-8?Q?=BA?=', 'to decode to', '☺');
        });

        it('should give up decoding a UTF-8 smiley (illegally) split up into 3 encoded words if there is regular text between the encoded words', function () {
            expect('=?utf-8?Q?=E2?= =?utf-8?Q?=98?=a=?utf-8?Q?=BA?==?utf-8?Q?=BA?=a', 'to decode to', '=?utf-8?Q?=E2?==?utf-8?Q?=98?=a=?utf-8?Q?=BA?==?utf-8?Q?=BA?=a');
        });

        it('should decode an encoded word following a undecodable sequence of encoded words', function () {
            expect('=?utf-8?Q?=E2?= =?utf-8?Q?=98?= =?iso-8859-1?Q?=A1?=Hola, se=?iso-8859-1?Q?=F1?=or!', 'to decode to', '=?utf-8?Q?=E2?==?utf-8?Q?=98?=¡Hola, señor!');
        });

        it('should handle test cases from the MIME tools package', function () {
            // From http://search.cpan.org/~dskoll/MIME-tools-5.502/lib/MIME/Words.pm:
            expect('=?ISO-8859-1?Q?Keld_J=F8rn_Simonsen?= <keld@dkuug.dk>', 'to decode to', 'Keld Jørn Simonsen <keld@dkuug.dk>');
            expect('=?US-ASCII?Q?Keith_Moore?= <moore@cs.utk.edu>', 'to decode to', 'Keith Moore <moore@cs.utk.edu>');
            expect('=?ISO-8859-1?Q?Andr=E9_?= Pirard <PIRARD@vm1.ulg.ac.be>', 'to decode to', 'André  Pirard <PIRARD@vm1.ulg.ac.be>');
            expect('=?iso-8859-1?Q?J=F8rgen_Nellemose?=', 'to decode to', 'Jørgen Nellemose');
            expect(
                '=?ISO-8859-1?B?SWYgeW91IGNhbiByZWFkIHRoaXMgeW8=?==?ISO-8859-2?B?dSB1bmRlcnN0YW5kIHRoZSBleGFtcGxlLg==?==?US-ASCII?Q?.._cool!?=',
                'to decode to',
                'If you can read this you understand the example... cool!'
            );
        });

        it('should handle a file name found in a Korean mail', function () {
            expect('=?ks_c_5601-1987?B?MTMwMTE3X8HWwvfA5V+1tcDlX7jetLq+8y5wZGY=?=', 'to decode to', '130117_주차장_도장_메뉴얼.pdf');
        });

        it('should handle bogus encoded words (spotted in the wild)', function () {
            expect('=?utf-8?Q??= <andreas@one.com>', 'to decode to', ' <andreas@one.com>');
        });

        it('should decode a character set not in iconv-lite', function () {
            expect('=?iso-2022-jp?B?GyRCRnxLXDhsJE4lNSVWJTglJyUvJUghXRsoQnRlc3Q=?=', 'to decode to', '日本語のサブジェクト−test');
        });
    });
});
