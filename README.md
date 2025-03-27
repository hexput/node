# Hexput Client

A WebSocket client for communicating with Hexput Runtime servers. This client allows for remote execution of Hexput code, parsing, and function registration with a Hexput Runtime instance.

## Installation

```bash
npm install hexput-client
```

## Usage

### Basic Connection

```typescript
import HexputClient from 'hexput-client';

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

### Checking Function Existence

Check if a function exists in the Hexput Runtime:

```typescript
const exists = await client.functionExists('someFunction');
if (exists) {
  console.log('Function exists in the runtime');
} else {
  console.log('Function does not exist');
}
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

##### `functionExists(functionName: string): Promise<boolean>`

Check if a function exists in the Hexput Runtime.

- `functionName`: The name of the function to check

### Options Interfaces

#### HexputExecutionOptions

```typescript
interface HexputExecutionOptions {
  no_object_constructions?: boolean;
  no_array_constructions?: boolean;
  no_object_navigation?: boolean;
  no_variable_declaration?: boolean;
  no_loops?: boolean;
  no_object_keys?: boolean;
  no_callbacks?: boolean;
  no_conditionals?: boolean;
  no_return_statements?: boolean;
  no_loop_control?: boolean;
  no_operators?: boolean;
  no_equality?: boolean;
  no_assignments?: boolean;
  [key: string]: boolean | undefined;
}
```

#### HexputParseOptions

```typescript
interface HexputParseOptions {
  minify?: boolean;
  include_source_mapping?: boolean;
  no_object_constructions?: boolean;
  [key: string]: boolean | undefined;
}
```

## License

MIT
