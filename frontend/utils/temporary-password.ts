// The password an account starts on — at creation, and again after a staff
// reset. Every call draws a fresh one, never a shared default: a password that
// is the same for everyone is known to everyone, so anybody who had once been
// handed it could sign in to any account still waiting for its first login and
// pick that account's real password themselves — a gym manager's included, in
// any gym. `must_change_password` still makes this one provisional; being
// unique is what keeps it private for those few minutes.
//
// Look-alike characters (0/O, 1/l/I) are left out: the maestro reads it off the
// screen and says it or writes it down. Twelve characters from 57 are about 70
// bits, grouped in fours for reading aloud.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 12;
const GROUP = 4;

type RandomBytes = (buffer: Uint8Array) => Uint8Array;

const cryptoBytes: RandomBytes = (buffer) => globalThis.crypto.getRandomValues(buffer);

// Some Supabase password policies ask for lower case, upper case and a digit;
// a draw missing one is thrown away rather than patched, so the result stays
// uniform over the passwords that qualify.
const qualifies = (value: string) =>
  /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);

export function generateTemporaryPassword(randomBytes: RandomBytes = cryptoBytes): string {
  // Bytes at or above the largest multiple of the alphabet's size are rejected,
  // so `byte % size` favours no character.
  const limit = 256 - (256 % ALPHABET.length);
  for (;;) {
    let chars = "";
    while (chars.length < LENGTH) {
      for (const byte of randomBytes(new Uint8Array(LENGTH * 2))) {
        if (byte < limit) chars += ALPHABET[byte % ALPHABET.length];
        if (chars.length === LENGTH) break;
      }
    }
    if (qualifies(chars)) {
      return chars.match(new RegExp(`.{${GROUP}}`, "g"))!.join("-");
    }
  }
}
