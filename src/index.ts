import { WebSocket } from 'ws';

/**
 * Options for configuring code execution and parsing in Hexput Runtime
 */
export interface HexputOptions {
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

/** Options for parse operation */
export type HexputParseOptions = HexputOptions;

/** Options for execution operation */
export type HexputExecutionOptions = Omit<HexputOptions, "minify"> & {
  secret_context?: Record<string, any>;
};

/**
 * Types of Hexput messages
 */
type HexputMessageType = 'parse' | 'execute' | 'is_function_exists';

/**
 * Interface for response handlers
 */
type ResponseHandler = (response: any) => void;

/**
 * Interface for function handlers
 * The first argument is always the secret context (if provided), followed by the arguments from the runtime.
 */
type FunctionHandler = (secretContext: Record<string, any>, ...args: any[]) => any;

/**
 * HexputClient class for communicating with a Hexput Runtime server
 */
export class HexputClient {
  private url: string;
  private ws: WebSocket | null = null;
  private callHandlers: Record<string, FunctionHandler> = {};
  private responseHandlers: Record<string, ResponseHandler> = {};
  private connectionPromise: Promise<void> | null = null;
  private connected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private debug: boolean;

  /**
   * Create a new HexputClient instance
   * 
   * @param url The WebSocket URL of the Hexput Runtime server
   * @param options Optional configuration options
   */
  constructor(url?: string, options: { debug?: boolean } = {}) {
    this.url = url || 'ws://localhost:9001';
    this.debug = options.debug || false;
    this.connect();
  }

  /**
   * Connect to the Hexput Runtime server
   * 
   * @returns A promise that resolves when the connection is established
   */
  public connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          this.log('Connected to Hexput Runtime');
          this.connected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('error', (error) => {
          this.log('WebSocket error:', error);
          if (!this.connected) {
            reject(error);
          }
        });

        this.ws.on('close', () => {
          this.log('Connection closed');
          this.connected = false;
          this.ws = null;
          this.connectionPromise = null;

          // Attempt to reconnect if not explicitly closed
          this.scheduleReconnect();
        });
      } catch (error) {
        this.log('Connection error:', error);
        this.connectionPromise = null;
        reject(error);
        
        // Attempt to reconnect on connection error
        this.scheduleReconnect();
      }
    });

    return this.connectionPromise;
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log('Maximum reconnection attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts);
    this.reconnectAttempts++;
    
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.log('Attempting to reconnect...');
      this.connect().catch(() => {}); // Catch to prevent unhandled promise rejection
    }, delay);
  }

  /**
   * Close the WebSocket connection
   */
  public close(): void {
    if (this.ws) {
      this.ws.close();
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Handle incoming WebSocket messages
   * 
   * @param data The message data as a string
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      
      // Handle connection message
      if (message.type === 'connection' && message.status === 'connected') {
        this.log('Connection confirmed by server');
        return;
      }
      
      // Handle function existence check
      if (message.action === 'is_function_exists') {
        const exists = typeof this.callHandlers[message.function_name] === 'function';
        this.sendMessage({
          id: message.id,
          exists: exists
        });
        return;
      }
      
      // Handle function call
      if (message.function_name && message.arguments) {
        this.handleFunctionCall(message);
        return;
      }
      
      // Handle response to our requests
      if (message.id && this.responseHandlers[message.id]) {
        this.responseHandlers[message.id](message);
        delete this.responseHandlers[message.id];
        return;
      }
      
      this.log('Unhandled message:', message);
    } catch (error) {
      this.log('Error parsing message:', error);
    }
  }

  /**
   * Handle a function call from the Hexput Runtime
   * 
   * @param message The function call message
   */
  private async handleFunctionCall(message: any): Promise<void> {
    const { id, function_name, arguments: args, secret_context } = message;
    const handler = this.callHandlers[function_name];
    const secretContextData = secret_context || {}; // Ensure secretContext is an object, even if null/undefined

    if (!handler) {
      this.sendMessage({
        id,
        error: `Function '${function_name}' is not registered`
      });
      return;
    }
    
    try {
      // Handle both synchronous and asynchronous functions
      // Pass secret_context as the first argument, followed by the runtime arguments
      const result = await Promise.resolve(handler(secretContextData, ...args)) ?? null;
      this.sendMessage({
        id,
        result
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendMessage({
        id,
        error: errorMessage
      });
    }
  }

  /**
   * Send a message to the Hexput Runtime server
   * 
   * @param message The message to send
   */
  private sendMessage(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Execute code in the Hexput Runtime
   * 
   * @param code The code to execute
   * @param options Execution options, including optional secret_context
   * @param context Initial context for execution
   * @returns A promise that resolves with the execution result
   */
  public async execute(code: string, options: HexputExecutionOptions = {}, context = {}): Promise<any> {
    await this.connect();
    
    return new Promise<any>((resolve, reject) => {
      const id = `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      this.responseHandlers[id] = (response) => {
        if (!response.success && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.result);
        }
      };
      
      try {
        // Prepare the message, including options and secret_context if provided
        const message: any = {
          id,
          action: 'execute',
          code,
          options: { ...options }, // Clone options to avoid modifying the original object
          context
        };

        // Remove secret_context from the main options object before sending if it exists
        // The server expects secret_context at the top level, not inside options.
        if (message.options.secret_context) {
          message.secret_context = message.options.secret_context;
          delete message.options.secret_context;
        }

        this.sendMessage(message);
      } catch (error) {
        delete this.responseHandlers[id];
        reject(error);
      }
    });
  }

  /**
   * Parse code using the Hexput Runtime
   * 
   * @param code The code to parse
   * @param options Parse options
   * @returns A promise that resolves with the parse result (AST)
   */
  public async parse(code: string, options: HexputParseOptions = {}): Promise<any> {
    await this.connect();
    
    return new Promise<any>((resolve, reject) => {
      const id = `parse-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      this.responseHandlers[id] = (response) => {
        if (!response.success && response.error) {
          reject(new Error(response.error));
        } else {
          resolve(response.result);
        }
      };
      
      try {
        this.sendMessage({
          id,
          action: 'parse',
          code,
          options
        });
      } catch (error) {
        delete this.responseHandlers[id];
        reject(error);
      }
    });
  }

  /**
   * Register a handler for a function that can be called by the Hexput Runtime
   * 
   * @param name The name of the function to register
   * @param handler The function implementation that will be called by the server
   */
  public registerFunction(name: string, handler: FunctionHandler): void {
    this.callHandlers[name] = handler;
    this.log(`Registered function: ${name}`);
  }

  /**
   * Unregister a function handler
   * 
   * @param name The name of the function to unregister
   */
  public unregisterFunction(name: string): void {
    delete this.callHandlers[name];
    this.log(`Unregistered function: ${name}`);
  }

  /**
   * Log debug messages if debug is enabled
   * 
   * @param args Arguments to log
   */
  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[HexputClient]', ...args);
    }
  }
}

// Export the main class
export default HexputClient;

