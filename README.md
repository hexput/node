# Hexput Client

A WebSocket client for communicating with Hexput Runtime servers. This client allows for remote execution of Hexput code, parsing, and function registration with a Hexput Runtime instance.

## Installation

```bash
npm install hexput
```

## Usage

### Basic Connection

```typescript
import HexputClient from 'hexput';

// Create a new client instance
const client = new HexputClient('ws://localhost:9091', { debug: true });

// Close connection when done
client.close();
```

### Executing Code

Execute Hexput code on the remote Hexput Runtime:

```typescript
const result = await client.execute(`
  vl x = 10;
  vl y = 20;
  res x + y;
`);
console.log(result); // 30
```

With execution options:

```typescript
const options = {
  no_loops: true,
  no_conditionals: true
};

try {
  const result = await client.execute(`
    vl items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    
    loop item in items {
      // This will fail due to no_loops option
      print(item);
    }
  `, options);
} catch (error) {
  console.error('Execution failed:', error.message);
  // Will throw an error due to no_loops option
}
```

### Parsing Code

Parse Hexput code to obtain its AST:

```typescript
const ast = await client.parse(`cb add(a, b) { res a + b; }`);
console.log(ast);
```

### Registering Functions

Register JavaScript functions that can be called from Hexput code:

```typescript
// Register a function
client.registerFunction('fetchData', async (url) => {
  const response = await fetch(url);
  return response.json();
});

// Unregister a function
client.unregisterFunction('fetchData');
```

## API Reference

### `HexputClient`

#### Constructor

```typescript
new HexputClient(url: string, options?: { debug?: boolean })
```

- `url`: WebSocket URL of the Hexput Runtime server
- `options`: Configuration options
  - `debug`: Enable debug logging (default: false)

#### Methods

##### `connect(): Promise<void>`

Connect to the Hexput Runtime server.

##### `close(): void`

Close the WebSocket connection.

##### `execute(code: string, options?: HexputExecutionOptions, context?: object): Promise<any>`

Execute Hexput code in the Hexput Runtime.

- `code`: The Hexput code to execute
- `options`: Execution options (see below)
- `context`: Initial context for execution

##### `parse(code: string, options?: HexputParseOptions): Promise<any>`

Parse Hexput code using the Hexput Runtime.

- `code`: The Hexput code to parse
- `options`: Parse options (see below)

##### `registerFunction(name: string, handler: Function): void`

Register a JavaScript function that can be called from Hexput code.

- `name`: The name of the function
- `handler`: The function handler

##### `unregisterFunction(name: string): void`

Unregister a function.

- `name`: The name of the function to unregister

### Options Interfaces

#### HexputOptions

```typescript
interface HexputOptions {
  /** Minify the output (default: true) */
  minify?: boolean;
  /** Include source mapping in output (default: false) */
  include_source_mapping?: boolean;
  /** Disable object construction literals (default: false) */
  no_object_constructions?: boolean;
  /** Disable array construction literals (default: false) */
  no_array_constructions?: boolean;
  /** Disable object property access (default: false) */
  no_object_navigation?: boolean;
  /** Disable variable declarations (default: false) */
  no_variable_declaration?: boolean;
  /** Disable loops (default: false) */
  no_loops?: boolean;
  /** Disable object keys access (default: false) */
  no_object_keys?: boolean;
  /** Disable callback functions (default: false) */
  no_callbacks?: boolean;
  /** Disable conditional statements (default: false) */
  no_conditionals?: boolean;
  /** Disable return statements (default: false) */
  no_return_statements?: boolean;
  /** Disable loop control (break/continue) (default: false) */
  no_loop_control?: boolean;
  /** Disable operators (default: false) */
  no_operators?: boolean;
  /** Disable equality operators (default: false) */
  no_equality?: boolean;
  /** Disable assignment operators (default: false) */
  no_assignments?: boolean;
}
```

#### HexputParseOptions and HexputExecutionOptions

```typescript
/** Options for parse operation */
type HexputParseOptions = HexputOptions;

/** Options for execution operation */
type HexputExecutionOptions = Omit<HexputOptions, "minify">;
```