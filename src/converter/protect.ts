const TOKEN_PREFIX = 'MARKMINEPROTECTED';
const TOKEN_SUFFIX = 'TOKEN';

export interface ProtectedText {
  text: string;
  restore(value: string): string;
}

const patterns: RegExp[] = [
  /<notextile>[\s\S]*?<\/notextile>/gi,
  /<pre\b[^>]*>[\s\S]*?<\/pre>/gi,
  /\[\[[^\]]+\]\]/g,
  /==[^=\n]+==/g,
  /attachment:[^\s)\]}]+/g,
  /version:"[^"]+"/g,
  /project:[A-Za-z0-9_.-]+/g,
  /commit:[A-Fa-f0-9]+/g,
  /(?:###|##|#)\d+\b/g,
  /\br\d+\b/g,
  /@[A-Za-z0-9_.-]+\b/g
];

function token(index: number): string {
  return `${TOKEN_PREFIX}${index}${TOKEN_SUFFIX}`;
}

function protectMacros(input: string, values: string[]): string {
  let output = '';
  let cursor = 0;

  while (cursor < input.length) {
    const start = input.indexOf('{{', cursor);
    if (start < 0) {
      output += input.slice(cursor);
      break;
    }

    output += input.slice(cursor, start);
    let depth = 1;
    let index = start + 2;

    while (index < input.length && depth > 0) {
      if (input.startsWith('{{', index)) {
        depth += 1;
        index += 2;
        continue;
      }
      if (input.startsWith('}}', index)) {
        depth -= 1;
        index += 2;
        continue;
      }
      index += 1;
    }

    if (depth !== 0) {
      output += input.slice(start);
      break;
    }

    const value = input.slice(start, index);
    const protectedIndex = values.push(value) - 1;
    output += token(protectedIndex);
    cursor = index;
  }

  return output;
}

export function protectRedmineSyntax(input: string): ProtectedText {
  const values: string[] = [];
  let text = protectMacros(input, values);

  for (const pattern of patterns) {
    text = text.replace(pattern, match => {
      const index = values.push(match) - 1;
      return token(index);
    });
  }

  return {
    text,
    restore(value: string) {
      return value.replace(new RegExp(`${TOKEN_PREFIX}(\\d+)${TOKEN_SUFFIX}`, 'g'), (_, index: string) => {
        return values[Number(index)] ?? _;
      });
    }
  };
}
