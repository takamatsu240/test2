const COMMIT_PATTERN = /(?:Closes?|Fix(?:es)?|Resolve[sd]?|Complete[sd]?|Done):\s*TODO-(\d+)/gi;
const message = 'close:TODO-003';

console.log('Testing commit message pattern matching');
console.log('Message:', message);
console.log('');

const todos = [];
let match;
const pattern = new RegExp(COMMIT_PATTERN);

while ((match = pattern.exec(message)) !== null) {
  console.log('Match found:', match);
  console.log('Captured group:', match[1]);
  todos.push('TODO-' + match[1]);
}

console.log('');
console.log('Result:', todos.length > 0 ? todos : 'No matches');
