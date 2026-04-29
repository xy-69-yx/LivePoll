import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}






export const PollError = {
  1: {message:"AlreadyInit"},
  2: {message:"BadOption"},
  3: {message:"ZeroRate"}
}

export interface Client {
  /**
   * Construct and simulate a vote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  vote: ({option}: {option: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a vote_for transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  vote_for: ({voter, option}: {voter: string, option: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_votes transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_votes: ({option}: {option: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_last_option transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_last_option: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_reward_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reward_rate: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_total_votes transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_total_votes: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_voter_votes transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_voter_votes: ({voter}: {voter: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a set_reward_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_reward_rate: ({rate}: {rate: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_reward_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reward_balance: ({voter}: {voter: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_reward_contract transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_reward_contract: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, reward, rate}: {admin: string, reward: string, rate: u32},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, reward, rate}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABQAAAAAAAAAAAAAACFJld2FyZGVkAAAAAQAAAAhyZXdhcmRlZAAAAAMAAAAAAAAABm9wdGlvbgAAAAAAEQAAAAEAAAAAAAAABmFtb3VudAAAAAAABAAAAAAAAAAAAAAAB2JhbGFuY2UAAAAABAAAAAAAAAAB",
        "AAAABQAAAAAAAAAAAAAACFZvdGVDYXN0AAAAAQAAAAV2b3RlZAAAAAAAAAIAAAAAAAAABm9wdGlvbgAAAAAAEQAAAAEAAAAAAAAABXZvdGVzAAAAAAAABAAAAAAAAAAA",
        "AAAABAAAAAAAAAAAAAAACVBvbGxFcnJvcgAAAAAAAAMAAAAAAAAAC0FscmVhZHlJbml0AAAAAAEAAAAAAAAACUJhZE9wdGlvbgAAAAAAAAIAAAAAAAAACFplcm9SYXRlAAAAAw==",
        "AAAAAAAAAAAAAAAEdm90ZQAAAAEAAAAAAAAABm9wdGlvbgAAAAAAEQAAAAEAAAAE",
        "AAAAAAAAAAAAAAAIdm90ZV9mb3IAAAACAAAAAAAAAAV2b3RlcgAAAAAAABMAAAAAAAAABm9wdGlvbgAAAAAAEQAAAAEAAAAE",
        "AAAAAAAAAAAAAAAJZ2V0X3ZvdGVzAAAAAAAAAQAAAAAAAAAGb3B0aW9uAAAAAAARAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAGcmV3YXJkAAAAAAATAAAAAAAAAARyYXRlAAAABAAAAAA=",
        "AAAAAAAAAAAAAAAPZ2V0X2xhc3Rfb3B0aW9uAAAAAAAAAAABAAAAEQ==",
        "AAAAAAAAAAAAAAAPZ2V0X3Jld2FyZF9yYXRlAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAPZ2V0X3RvdGFsX3ZvdGVzAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAPZ2V0X3ZvdGVyX3ZvdGVzAAAAAAEAAAAAAAAABXZvdGVyAAAAAAAAEwAAAAEAAAAE",
        "AAAAAAAAAAAAAAAPc2V0X3Jld2FyZF9yYXRlAAAAAAEAAAAAAAAABHJhdGUAAAAEAAAAAA==",
        "AAAAAAAAAAAAAAASZ2V0X3Jld2FyZF9iYWxhbmNlAAAAAAABAAAAAAAAAAV2b3RlcgAAAAAAABMAAAABAAAABA==",
        "AAAAAAAAAAAAAAATZ2V0X3Jld2FyZF9jb250cmFjdAAAAAAAAAAAAQAAABM=" ]),
      options
    )
  }
  public readonly fromJSON = {
    vote: this.txFromJSON<u32>,
        vote_for: this.txFromJSON<u32>,
        get_votes: this.txFromJSON<u32>,
        get_last_option: this.txFromJSON<string>,
        get_reward_rate: this.txFromJSON<u32>,
        get_total_votes: this.txFromJSON<u32>,
        get_voter_votes: this.txFromJSON<u32>,
        set_reward_rate: this.txFromJSON<null>,
        get_reward_balance: this.txFromJSON<u32>,
        get_reward_contract: this.txFromJSON<string>
  }
}