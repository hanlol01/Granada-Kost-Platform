import * as argon2 from 'argon2';

async function main(): Promise<void> {
  const password = process.argv[2];

  if (!password) {
    throw new Error('Usage: npm --workspace @granada-kost/api run auth:hash-password -- "<password>"');
  }

  console.log(await argon2.hash(password));
}

void main();
