import { greet, sum } from './utils';

const name = process.argv[2] ?? 'World';
console.log(greet(name));
console.log(`1 + 2 = ${sum(1, 2)}`);
