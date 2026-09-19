# Cafe Bazaar signed release (`.bin`)

Cafe Bazaar doesn't accept a raw `.aab` the way Google Play does. It needs a
signed digest file (`.bin`), produced offline with Cafe Bazaar's own
[`bundle-signer`](https://github.com/cafebazaar/bundle-signer) tool from the
`.aab` plus this app's signing key. Bazaar never sees the private key itself
— only the `.bin` you upload.

## Do this exactly once, ever

`.ssh-key` (in the project root, gitignored) is this app's permanent signing
key. `cert.pem` (in this folder, tracked in git) is the X.509 certificate
generated for it. **Every future release must be signed with this exact
key + this exact certificate file** — not a freshly generated one. Android's
(and Bazaar's) update check compares the signing certificate byte-for-byte,
not just the underlying key, so regenerating the certificate would make
Bazaar treat the update as a different, incompatible app and reject it.

So: never delete `.ssh-key`, never re-run the `openssl req -x509 ...` step
below, and keep both files backed up somewhere outside git in addition to
the git history (a lost private key means this app can never be updated on
Bazaar again under this signing identity).

## Regenerating `app.bin` for a new release

You'll need Java 8+ and OpenSSL locally (OpenSSL is preinstalled almost
everywhere; Java usually isn't — see the note at the bottom if `java` isn't
on your PATH).

1. **Build a new `.aab`** the normal way:
   ```sh
   npx eas build --platform android --profile production --non-interactive
   ```
   Download the resulting `.aab` from the URL EAS prints (or from
   https://expo.dev/accounts/s-pouya-shs-team/projects/kinbridge/builds).

2. **Get the `bundlesigner` jar** (skip if you already have it saved
   locally — it doesn't change per-release):
   ```sh
   gh release download --repo cafebazaar/bundle-signer --pattern "*.jar" -D .
   ```

3. **Convert the private key to the format `bundlesigner` wants.**
   `.ssh-key` is a PKCS#1 PEM RSA key; `bundlesigner --key` needs PKCS#8 DER.
   This conversion is lossless and can be redone any time — it's the same
   key, just re-encoded:
   ```sh
   openssl pkcs8 -topk8 -inform PEM -in .ssh-key -outform DER -out key.pk8 -nocrypt
   ```

4. **Sign the bundle**, pointing `--bundle` at your new `.aab` and `--cert`
   at the *existing* `bazaar-release/cert.pem` (never a new one):
   ```sh
   java -jar bundlesigner-0.1.13.jar genbin -v \
     --bundle /path/to/your-new-build.aab \
     --bin bazaar-release/ \
     --v2-signing-enabled true \
     --v3-signing-enabled false \
     --key key.pk8 \
     --cert bazaar-release/cert.pem
   ```
   This overwrites `bazaar-release/app.bin` with the freshly signed one.

5. Upload `bazaar-release/app.bin` to your app's release page in the
   [Cafe Bazaar developer console](https://developers.cafebazaar.ir/).

## If you ever need Java and don't have it installed

No root/sudo needed — download a portable JRE and point straight at its
`java` binary instead of relying on one from PATH:
```sh
curl -sL "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jre/hotspot/normal/eclipse" -o jre.tar.gz
tar xzf jre.tar.gz
./jdk-*-jre/bin/java -jar bundlesigner-0.1.13.jar ...
```

## How `cert.pem` was first created

For reference only — **do not re-run this**, it's already done:
```sh
openssl req -x509 -key .ssh-key -out bazaar-release/cert.pem -days 10950 \
  -subj "/CN=Family Tree/OU=App Signing/O=Family Tree App"
```
(`-days 10950` ≈ 30 years, matching the long validity Android app signing
certificates are conventionally given.)

Certificate fingerprint (SHA-256), for verifying you're using the right one:
```
99:B3:11:22:F4:9A:A5:FF:8A:35:93:16:AD:02:9B:32:35:CB:A5:2F:26:04:FB:BE:42:C8:60:B8:AF:B5:39:A2
```
