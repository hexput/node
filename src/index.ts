import { WebSocket } from 'ws';

/**
 * Options for configuring code execution in Hexput Runtime
 */
export interface HexputExecutionOptions {
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


/**
 * Options for configuring code parsing in Hexput Runtime
 */
export interface HexputParseOptions {
  minify?: boolean;
  include_source_mapping?: boolean;
  no_object_constructions?: boolean;
  [key: string]: boolean | undefined;
}

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
 */
type FunctionHandler = (...args: any[]) => any;

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
    const { id, function_name, arguments: args } = message;
    const handler = this.callHandlers[function_name];
    
    if (!handler) {
      this.sendMessage({
        id,
        error: `Function '${function_name}' is not registered`
      });
      return;
    }
    
    try {
      // Handle both synchronous and asynchronous functions
      const result = await Promise.resolve(handler(...args)) ?? null;
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
   * @param options Execution options
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
        this.sendMessage({
          id,
          action: 'execute',
          code,
          options,
          context
        });
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
