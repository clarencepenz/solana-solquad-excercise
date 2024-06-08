import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import idl from "../target/idl/solquad.json";
import { Solquad } from "../target/idl/solquad";

import { utf8 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { BN } from "bn.js";

describe("solquad", async () => {
  const connection = new anchor.web3.Connection(anchor.web3.clusterApiUrl("devnet"), 'confirmed');
  const programId = new anchor.web3.PublicKey("3fowu869PY6frqrYPdhtCzsm7j1jgjpr47HyuyMP9xUH");

  const admin = anchor.web3.Keypair.generate();
  const admin2 = anchor.web3.Keypair.generate();
  const wallet = new anchor.Wallet(admin);

  const provider = new anchor.AnchorProvider(connection, wallet, {});
  const provider2 = new anchor.AnchorProvider(connection, new anchor.Wallet(admin2), {});
  const program = new Program<Solquad>(idl as Solquad, programId, provider);
  const program2 = new Program<Solquad>(idl as Solquad, programId, provider2);

  const escrowOwner = anchor.web3.Keypair.generate();
  const projectOwner1 = anchor.web3.Keypair.generate();
  const projectOwner2 = anchor.web3.Keypair.generate();
  const projectOwner3 = anchor.web3.Keypair.generate();
  const voter1 = anchor.web3.Keypair.generate();
  const voter2 = anchor.web3.Keypair.generate();
  const voter3 = anchor.web3.Keypair.generate();
  const voter4 = anchor.web3.Keypair.generate();
  const voter5 = anchor.web3.Keypair.generate();
  const voter6 = anchor.web3.Keypair.generate();

  const [escrowPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [utf8.encode("escrow"), admin.publicKey.toBuffer()],
    program.programId
  );

  const [poolPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [utf8.encode("pool"), admin.publicKey.toBuffer()],
    program.programId
  );

  const [projectPDA1] = anchor.web3.PublicKey.findProgramAddressSync(
    [utf8.encode("project"), poolPDA.toBytes(), projectOwner1.publicKey.toBuffer()],
    program.programId
  );

  const [differentEscrowPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [utf8.encode("escrow"), admin2.publicKey.toBuffer()],
    program.programId
  );

  const [differentPoolPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [utf8.encode("pool"), admin2.publicKey.toBuffer()],
    program.programId
  );

  await airdrop(admin, provider);
  await airdrop(admin2, provider);

  // Test 1
  it("initializes escrow and pool", async () => {
    const poolIx = await program.methods.initializePool().accounts({
      poolAccount: poolPDA,
      poolSigner: admin.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).instruction();

    const escrowAndPoolTx = await program.methods.initializeEscrow(new BN(10000)).accounts({
      escrowAccount: escrowPDA,
      escrowSigner: admin.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .postInstructions([poolIx])
    .rpc();

    console.log("Escrow and Pool are successfully created!", escrowAndPoolTx);
  });

  // Test 2
  it("creates project and adds it to the pool", async () => {
    const initializeProjectTx = await program.methods.initializeProject("My Project").accounts({
      projectAccount: projectPDA1,
      projectOwner: projectOwner1.publicKey,
      poolAccount: poolPDA,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc();

    console.log("Project successfully created", initializeProjectTx);

    const addProjectTx = await program.methods.addProjectToPool().accounts({
      escrowAccount: escrowPDA,
      poolAccount: poolPDA,
      projectAccount: projectPDA1,
      projectOwner: projectOwner1.publicKey,
    }).rpc();

    console.log("Project successfully added to the pool", addProjectTx);

    const data = await program.account.pool.fetch(poolPDA);
    console.log("Data projects", data.projects);
  });

  // Test 3
  it("tries to add the project in the different pool", async () => {
    const poolIx = await program2.methods.initializePool().accounts({
      poolAccount: differentPoolPDA,
      poolSigner: admin2.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).instruction();

    const escrowIx = await program2.methods.initializeEscrow(new BN(10000)).accounts({
      escrowAccount: differentEscrowPDA,
      escrowSigner: admin2.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).instruction();

    const addProjectTx = await program2.methods.addProjectToPool().accounts({
      projectAccount: projectPDA1,
      poolAccount: differentPoolPDA,
      escrowAccount: differentEscrowPDA,
      projectOwner: projectOwner1.publicKey,
    })
    .preInstructions([escrowIx, poolIx])
    .rpc();

    console.log("Different pool is created and the project is inserted into it", addProjectTx);

    const data = await program2.account.pool.fetch(differentPoolPDA);
    console.log("Data projects", data.projects);
  });

  // Test 4
  it("votes for the project and distributes the rewards", async () => {
    const voteTx = await program.methods.voteForProject(new BN(10)).accounts({
      poolAccount: poolPDA,
      projectAccount: projectPDA1,
      voterSig: voter1.publicKey,
    }).rpc();

    console.log("Successfully voted on the project", voteTx);

    const distribTx = await program.methods.distributeEscrowAmount().accounts({
      escrowAccount: escrowPDA,
      poolAccount: poolPDA,
      projectAccount: projectPDA1,
      escrowCreator: admin.publicKey,
    }).rpc();

    console.log("Successfully distributed weighted rewards", distribTx);

    const ant = await program.account.project.fetch(projectPDA1);
    console.log("Distributed amount", ant.distributedAmt.toString());
  });
});

async function airdrop(user, provider) {
  const AIRDROP_AMOUNT = anchor.web3.LAMPORTS_PER_SOL; // 1 SOL

  // airdrop to user
  const airdropSignature = await provider.connection.requestAirdrop(
    user.publicKey,
    AIRDROP_AMOUNT
  );
  const { blockhash, lastValidBlockHeight } = await provider.connection.getLatestBlockhash();

  await provider.connection.confirmTransaction({
    blockhash: blockhash,
    lastValidBlockHeight: lastValidBlockHeight,
    signature: airdropSignature,
  });

  console.log(`Tx Complete: https://explorer.solana.com/tx/${airdropSignature}?cluster=devnet`)
}
