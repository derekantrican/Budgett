// Generates a bcrypt hash for LOGIN_PASSWORD_HASH.
//
// Usage (from server/):
//   npm run hash-password              -> prompts for the password (input hidden)
//   npm run hash-password -- <password>  -> hashes the argument (note: ends up in shell history)

const bcrypt = require('bcryptjs');
const readline = require('readline');

const COST = 12;

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Swallow echoed keystrokes so the password isn't shown on screen
    rl._writeToOutput = (str) => {
      if (str.startsWith(question)) {
        rl.output.write(str);
      }
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  let password = process.argv[2];
  if (!password) {
    password = await promptHidden('Password: ');
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) {
      console.error('Passwords do not match.');
      process.exit(1);
    }
  }

  if (!password) {
    console.error('Password cannot be empty.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, COST);
  console.log('\nAdd this to your .env (the single quotes keep the "$" characters from being interpreted):\n');
  console.log(`LOGIN_PASSWORD_HASH='${hash}'`);
}

main();
