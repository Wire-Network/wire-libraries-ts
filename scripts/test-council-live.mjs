#!/usr/bin/env node
/**
 * Exercise the candidate SDK against a disposable producing node, never a shared deployment.
 * Requires WIRE_COUNCIL_NODEOP, WIRE_COUNCIL_CONTRACTS, WIRE_COUNCIL_BIND_PROVIDER,
 * and WIRE_COUNCIL_RUN_DIRECTORY. Build sdk-core and synchronize contract artifacts first.
 * The bind provider must be the platform's compiled BindConfigProvider module.
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const sdkPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/sdk-core/lib/cjs/index.js"
)
const {
  ABI,
  Action,
  APIClient,
  CompressionType,
  KeyType,
  PackedTransaction,
  PrivateKey,
  Serializer,
  SignedTransaction,
  SysioContracts,
  Transaction,
  contracts,
  createClassicSigner
} = require(sdkPath)

const SeatCount = 21
const CandidateCount = 23
const TimeSlotSeconds = 5
const PollMs = 100
const TimeoutMs = 30_000
const CandidateRamBytes = 65_536
const SystemAccount = "sysio"
const CouncilAccount = "sysio.councl"
const RoaAccount = "sysio.roa"
const ActivePermission = "active"

/** Require explicit local inputs; there is deliberately no remote endpoint option. */
function requiredPath(name) {
  assert(process.env[name], `${name} is required`)
  return resolve(process.env[name])
}

const nodeop = requiredPath("WIRE_COUNCIL_NODEOP")
const contractRoot = requiredPath("WIRE_COUNCIL_CONTRACTS")
const runDirectory = requiredPath("WIRE_COUNCIL_RUN_DIRECTORY")
const { BindConfigProvider } = require(
  requiredPath("WIRE_COUNCIL_BIND_PROVIDER")
)
const key = PrivateKey.generate(KeyType.K1)
const finalizerKey = PrivateKey.generate(KeyType.BLS)
const publicKey = key.toPublic().toString()
const authority = {
  threshold: 1,
  keys: [{ key: publicKey, weight: 1 }],
  accounts: [],
  waits: []
}
const owners = Array.from(
  { length: SeatCount },
  (_, index) => `owner${String.fromCharCode(97 + index)}`
)
const candidates = Array.from(
  { length: CandidateCount },
  (_, index) => `cand${String.fromCharCode(97 + index)}`
)
let child
let client

/** Fail within a bounded interval while retaining the most recent RPC error. */
async function waitUntil(label, probe) {
  const deadline = Date.now() + TimeoutMs
  let lastError
  while (Date.now() < deadline) {
    assert(
      child.exitCode === null,
      `nodeop exited; inspect ${join(runDirectory, "nodeop.log")}`
    )
    try {
      const result = await probe()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await delay(PollMs)
  }
  throw new Error(`Timed out waiting for ${label}`, { cause: lastError })
}

/** Wait for a produced block, so state queries observe committed action results. */
async function waitForBlock(blockNumber) {
  return waitUntil(
    "block production",
    async () =>
      (await client.v1.chain.get_info()).head_block_num.toNumber() >=
      blockNumber
  )
}

/** Encode from an explicit ABI for the initial native actions before sysio has an ABI. */
async function pushEncoded(actions) {
  const info = await client.v1.chain.get_info()
  const transaction = Transaction.from({
    ...info.getTransactionHeader(),
    actions
  })
  const { msgBytes } = transaction.signingDigest(info.chain_id, KeyType.K1)
  const signed = SignedTransaction.from({
    ...transaction,
    signatures: [key.signDigest(msgBytes)]
  })
  const result = await client.v1.chain.push_transaction(
    PackedTransaction.fromSigned(signed, CompressionType.none)
  )
  await waitForBlock(Number(result.processed.block_num))
  return result
}

/** Deploy only into this script's newly created chain, using matching source artifacts. */
async function deploy(account, contract) {
  const abi = ABI.from(
    readFileSync(join(contractRoot, contract, `${contract}.abi`), "utf8")
  )
  const biosAbi = ABI.from(
    readFileSync(join(contractRoot, "sysio.bios/sysio.bios.abi"), "utf8")
  )
  const authorization = [{ actor: account, permission: ActivePermission }]
  await pushEncoded([
    Action.from(
      {
        account: SystemAccount,
        name: "setcode",
        authorization,
        data: {
          account,
          vmtype: 0,
          vmversion: 0,
          code: readFileSync(
            join(contractRoot, contract, `${contract}.wasm`)
          ).toString("hex")
        }
      },
      biosAbi
    ),
    Action.from(
      {
        account: SystemAccount,
        name: "setabi",
        authorization,
        data: { account, abi: Serializer.encode({ object: abi }).hexString }
      },
      biosAbi
    )
  ])
}

/** Submit through the generated SDK proxy and the SDK's classic transaction signer. */
async function invoke(contract, action, data, actor) {
  const result = await contract.actions[action].invoke(data, {
    authorization: [`${actor}@${ActivePermission}`]
  })
  await waitForBlock(Number(result.processed.block_num))
  return result
}

/** Generated typed table queries use the unified RPC's primary KV index and numeric scope. */
async function first(table, scope = "0") {
  return table.first({ scope })
}

/** Activate built-in features in dependency order on the private node. */
async function activateFeatures(bios) {
  const features = await client.call({
    path: "/v1/producer/get_supported_protocol_features",
    params: {}
  })
  const preactivate = features.find(feature =>
    feature.specification.some(spec => spec.value === "PREACTIVATE_FEATURE")
  )
  if (preactivate) {
    await client.call({
      path: "/v1/producer/schedule_protocol_feature_activations",
      params: { protocol_features_to_activate: [preactivate.feature_digest] }
    })
    await waitForBlock(
      (await client.v1.chain.get_info()).head_block_num.toNumber() + 2
    )
  }
  await deploy(SystemAccount, "sysio.bios")
  const activated = new Set(preactivate ? [preactivate.feature_digest] : [])
  const remaining = features.filter(
    feature => !activated.has(feature.feature_digest)
  )
  while (remaining.length) {
    const next = remaining.findIndex(feature =>
      feature.dependencies.every(digest => activated.has(digest))
    )
    assert(next >= 0, "protocol feature dependency cycle")
    const [feature] = remaining.splice(next, 1)
    await invoke(
      bios,
      "activate",
      { feature_digest: feature.feature_digest },
      SystemAccount
    )
    activated.add(feature.feature_digest)
  }
}

/** Bootstrap rosters and candidates using real on-chain actions, without fixture database writes. */
async function bootstrap() {
  const bios = contracts.sysio.getSysioContract(
    SysioContracts.SysioContractName.bios,
    { client }
  )
  await activateFeatures(bios)
  const accounts = [
    RoaAccount,
    CouncilAccount,
    "sysio.acct",
    "sysio.authex",
    ...owners,
    ...candidates
  ]
  const options = { authorization: [`${SystemAccount}@${ActivePermission}`] }
  const created = await client.pushTransaction(
    accounts.flatMap(name => [
      bios.actions.newaccount.prepare(
        { creator: SystemAccount, name, owner: authority, active: authority },
        options
      ),
      bios.actions.setalimits.prepare(
        {
          account: name,
          ram_bytes: name.startsWith("sysio.") ? -1 : CandidateRamBytes,
          net_weight: -1,
          cpu_weight: -1
        },
        options
      )
    ])
  )
  await waitForBlock(Number(created.processed.block_num))
  await deploy(RoaAccount, "sysio.roa")
  await deploy(CouncilAccount, "sysio.councl")
  await invoke(
    bios,
    "setpriv",
    { account: RoaAccount, is_priv: 1 },
    SystemAccount
  )
  await invoke(
    bios,
    "setpriv",
    { account: CouncilAccount, is_priv: 1 },
    SystemAccount
  )
  await deploy(SystemAccount, "sysio.system")
  const system = contracts.sysio.getSysioContract(
    SysioContracts.SysioContractName.system,
    { client }
  )
  await invoke(system, "init", { version: 0, core: "4,SYS" }, SystemAccount)
  const roa = contracts.sysio.getSysioContract(
    SysioContracts.SysioContractName.roa,
    { client }
  )
  await invoke(
    roa,
    "activateroa",
    { total_sys: "75496.0000 SYS", bytes_per_unit: 104 },
    RoaAccount
  )
  const registeredOwners = await client.pushTransaction(
    owners.map(owner =>
      roa.actions.forcereg.prepare(
        { owner, tier: 1 },
        {
          authorization: [`${RoaAccount}@${ActivePermission}`]
        }
      )
    )
  )
  await waitForBlock(Number(registeredOwners.processed.block_num))
  const council = contracts.sysio.getSysioContract(
    SysioContracts.SysioContractName.councl,
    { client }
  )
  const registeredCandidates = await client.pushTransaction(
    candidates.map(account =>
      council.actions.addcandidate.prepare(
        { account, handle: account },
        {
          authorization: [`${account}@${ActivePermission}`]
        }
      )
    )
  )
  await waitForBlock(Number(registeredCandidates.processed.block_num))
  await invoke(
    council,
    "startinit",
    { time_slot_sec: TimeSlotSeconds, ordered_owners: owners },
    CouncilAccount
  )
  await invoke(council, "loadtier", { tier: 2, max_rows: 100 }, CouncilAccount)
  await invoke(council, "loadtier", { tier: 3, max_rows: 100 }, CouncilAccount)
  await invoke(council, "finalizeinit", {}, CouncilAccount)
  return council
}

/** Read state through the SDK, sign/submit its generated ballot, and verify chain execution. */
async function exercise(council) {
  const config = await first(council.tables.config)
  let state = await first(council.tables.state)
  assert(state, "deployed election state is readable through the SDK")
  const identity = {
    election_gen: config.election_gen,
    round_id: state.round_id
  }
  const crank = () =>
    invoke(
      council,
      "settle",
      { caller: owners[0], ...identity, max_steps: SeatCount },
      owners[0]
    )
  await delay((TimeSlotSeconds + 1) * 1000)
  await crank()
  await crank()
  state = await first(council.tables.state)
  assert.equal(state.phase, "VOTING")
  assert.equal(state.t1_ballots, 0)
  const scope = String(config.election_gen)
  const { rows: flights } = await council.tables.flights.query({
    scope,
    limit: SeatCount
  })
  assert.equal(flights.length, SeatCount)
  const target = flights.find(flight => Number(flight.seat) === 0)
  assert(target)
  const voter = owners[1]
  const votes = flights
    .filter(flight => Number(flight.seat) !== 1)
    .map(flight => ({
      seat: Number(flight.seat),
      v1: Number(flight.seat) === 0,
      v2: false,
      v3: false
    }))
  assert.equal(votes.length, SeatCount - 1)
  const ballot = { voter, ...identity, flight_hash: state.flight_hash, votes }
  const submitted = await invoke(council, "vote", ballot, voter)
  const { rows: ballots } = await council.tables.ballots.query({
    scope
  })
  assert.equal(ballots.length, 1)
  assert.equal(ballots[0].voter, voter)
  assert.equal(ballots[0].flight_hash, ballot.flight_hash)
  // Wire's JSON table decoder renders ABI bool fields as the exact integers 0/1.
  assert.deepEqual(
    ballots[0].votes,
    votes.map(vote => ({
      ...vote,
      v1: Number(vote.v1),
      v2: Number(vote.v2),
      v3: Number(vote.v3)
    }))
  )
  // Decode binary with the deployed ABI as well: encoding numeric JSON booleans
  // through BoolType.toABI would incorrectly encode numeric 1 as false.
  const deployedAbi = ABI.from(
    (await client.v1.chain.get_abi(CouncilAccount)).abi
  )
  const { rows: encodedBallots } = await council.tables.ballots.query({
    scope,
    json: false,
    limit: SeatCount
  })
  assert.equal(encodedBallots.length, 1)
  const encodedBallot = encodedBallots[0]
  assert.equal(typeof encodedBallot.key, "string")
  assert.equal(typeof encodedBallot.value, "string")
  const decodedBallot = Serializer.objectify(
    Serializer.decode({
      data: encodedBallot.value,
      type: "ballot_row",
      abi: deployedAbi
    })
  )
  assert.deepEqual(decodedBallot.votes, votes)
  const after = await first(council.tables.state)
  assert.equal(after.t1_ballots, 1)
  assert.equal(after.t2_ballots, 0)
  assert.equal(after.t3_ballots, 0)
  const { rows: updatedFlights } = await council.tables.flights.query({
    scope,
    limit: SeatCount
  })
  const updated = updatedFlights.find(flight => Number(flight.seat) === 0)
  assert(updated)
  assert.equal(updated.tallies[0].yes1, 1)
  assert.equal(updated.tallies[0].votes_cast, 1)
  await delay((TimeSlotSeconds + 1) * 1000)
  await crank()
  await crank()
  const elected = await first(council.tables.council, scope)
  assert.equal(Number(elected.seat), 0)
  assert.equal(elected.member, target.candidates[0])
  assert.equal(elected.filled_tier, "T1")
  const final = await first(council.tables.state)
  assert.equal(final.phase, "CONTINUING")
  assert.equal(final.seats_filled, 1)
  await crank()
  const nextRound = await first(council.tables.state)
  assert.equal(nextRound.phase, "NOMINATING")
  assert.equal(Number(nextRound.round_id), Number(state.round_id) + 1)
  assert.equal(nextRound.seats_filled, 1)
  assert.equal(nextRound.t1_ballots, 0)
  assert.equal(nextRound.t2_ballots, 0)
  assert.equal(nextRound.t3_ballots, 0)
  assert.equal(
    (await first(council.tables.council, scope)).member,
    elected.member
  )
  const info = await client.v1.chain.get_info()
  return {
    ballot_transaction: submitted.transaction_id,
    ballot_count: after.t1_ballots,
    member: elected.member,
    seats_filled: final.seats_filled,
    continuation_round: nextRound.round_id,
    chain_id: String(info.chain_id),
    sdk_path: sdkPath,
    nodeop_path: nodeop,
    contract_root: contractRoot,
    rpc_boolean_representation:
      "JSON 0/1; binary ballot decoded with deployed ABI",
    pagination_scope:
      "Bounded complete round tables; composite KV cursor pagination is not exercised"
  }
}

/** Own the process and its registry reservation for the entire integration run. */
async function main() {
  mkdirSync(runDirectory, { recursive: false, mode: 0o700 })
  const bind = await BindConfigProvider.resolve(
    {},
    {
      producerCount: 0,
      batchCount: 0,
      underwriterCount: 0,
      apiCount: 0,
      adHocCount: 0
    }
  )
  const ports = bind.nodeop.ports.bios
  const configDirectory = join(runDirectory, "config")
  mkdirSync(configDirectory, { mode: 0o700 })
  const configPath = join(configDirectory, "config.ini")
  writeFileSync(
    configPath,
    [
      `http-server-address = ${bind.nodeop.address}:${ports.http}`,
      `p2p-listen-endpoint = ${bind.nodeop.address}:${ports.p2p}`,
      "plugin = sysio::chain_api_plugin",
      "plugin = sysio::producer_api_plugin",
      "plugin = sysio::producer_plugin",
      "producer-name = sysio",
      "enable-stale-production = true",
      `signature-provider = council-producer,wire,wire,${publicKey},KEY:${key.toString()}`,
      `signature-provider = council-finalizer,wire,wire_bls,${finalizerKey.toPublic().toString()},KEY:${finalizerKey.toString()}`,
      "http-validate-host = false",
      "chain-state-db-size-mb = 256",
      "wasm-runtime = sys-vm-jit"
    ].join("\n"),
    { mode: 0o600 }
  )
  const genesisPath = join(runDirectory, "genesis.json")
  writeFileSync(
    genesisPath,
    JSON.stringify({
      initial_timestamp: new Date().toISOString().replace("Z", ""),
      initial_key: publicKey,
      initial_finalizer_key: finalizerKey.toPublic().toString()
    }),
    { mode: 0o600 }
  )
  const log = openSync(join(runDirectory, "nodeop.log"), "w", 0o600)
  child = spawn(
    nodeop,
    [
      "--data-dir",
      join(runDirectory, "data"),
      "--config-dir",
      configDirectory,
      "--genesis-json",
      genesisPath
    ],
    { stdio: ["ignore", log, log] }
  )
  closeSync(log)
  const exit = once(child, "exit")
  try {
    client = new APIClient({
      url: `http://${bind.nodeop.address}:${ports.http}`,
      signer: createClassicSigner(key)
    })
    await waitUntil("node readiness", () => client.v1.chain.get_info())
    console.log(
      "Disposable node is producing; bootstrapping election accounts and contracts."
    )
    const council = await bootstrap()
    console.log(
      "Election initialized; submitting the generated SDK ballot over RPC."
    )
    const report = await exercise(council)
    writeFileSync(
      join(runDirectory, "result.json"),
      JSON.stringify(report, null, 2)
    )
    console.log(JSON.stringify(report))
  } finally {
    child.kill("SIGTERM")
    const abort = new AbortController()
    await Promise.race([
      exit,
      delay(TimeoutMs, null, { signal: abort.signal }).then(() =>
        child.kill("SIGKILL")
      )
    ])
    abort.abort()
    await exit
    rmSync(configPath)
    const logPath = join(runDirectory, "nodeop.log")
    writeFileSync(
      logPath,
      readFileSync(logPath, "utf8")
        .replaceAll(key.toString(), "<redacted>")
        .replaceAll(finalizerKey.toString(), "<redacted>")
    )
  }
}

await main().catch(error => {
  console.error(error.stack)
  if (error.cause) console.error(error.cause.message)
  process.exitCode = 1
})
