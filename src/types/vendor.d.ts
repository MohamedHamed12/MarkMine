declare module 'textile-js' {
  interface TextileOptions {
    breaks?: boolean;
  }

  interface Textile {
    (input: string, options?: TextileOptions): string;
    parse(input: string): unknown;
  }

  const textile: Textile;
  export default textile;
}
