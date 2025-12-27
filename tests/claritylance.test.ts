import { 
  describe,
  expect,
  it,
  beforeEach,
  Chain,
  Account,
  types,
} from '../deps.ts';

describe('claritylance contract test', () => {
  let chain: Chain;
  let accounts: Map<string, Account>;
  let deployer: Account;
  let client: Account;
  let freelancer: Account;
  let resolver: Account;

  beforeEach(() => {
      chain = new Chain();
      accounts = chain.accounts;
      deployer = accounts.get('deployer')!;
      client = accounts.get('wallet_1')!;
      freelancer = accounts.get('wallet_2')!;
      resolver = accounts.get('wallet_3')!;
  });

  it('should allow creating a new project', () => {
      const totalAmount = 1000;
      const block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'create-project',
              [
                  types.utf8("Build a website"),
                  types.uint(totalAmount),
                  types.uint(3),
                  types.principal(resolver.address)
              ],
              client.address
          )
      ]);

      block.receipts[0].result.expectOk().expectUint(1);
      block.receipts[0].events.expectSTXTransferEvent(
          totalAmount,
          client.address,
          `${deployer.address}.claritylance`
      );
  });

  it('should allow freelancer to accept project', () => {
      // First create a project
      let block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'create-project',
              [
                  types.utf8("Build a website"),
                  types.uint(1000),
                  types.uint(3),
                  types.principal(resolver.address)
              ],
              client.address
          )
      ]);

      // Then accept it
      block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'accept-project',
              [types.uint(1)],
              freelancer.address
          )
      ]);

      block.receipts[0].result.expectOk().expectBool(true);
  });

  it('should allow setting up milestones', () => {
      // Create project first
      let block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'create-project',
              [
                  types.utf8("Build a website"),
                  types.uint(1000),
                  types.uint(3),
                  types.principal(resolver.address)
              ],
              client.address
          )
      ]);

      // Set up milestone
      block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'set-milestone',
              [
                  types.uint(1),
                  types.uint(0),
                  types.uint(300),
                  types.utf8("Frontend completion")
              ],
              client.address
          )
      ]);

      block.receipts[0].result.expectOk().expectBool(true);
  });

  it('should handle the complete milestone workflow', () => {
      // Create project
      let block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'create-project',
              [
                  types.utf8("Build a website"),
                  types.uint(1000),
                  types.uint(3),
                  types.principal(resolver.address)
              ],
              client.address
          )
      ]);

      // Accept project
      block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'accept-project',
              [types.uint(1)],
              freelancer.address
          )
      ]);

      // Set milestone
      block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'set-milestone',
              [
                  types.uint(1),
                  types.uint(0),
                  types.uint(300),
                  types.utf8("Frontend completion")
              ],
              client.address
          )
      ]);

      // Submit milestone
      block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'submit-milestone',
              [
                  types.uint(1),
                  types.uint(0),
                  types.utf8("Github repo: https://github.com/...")
              ],
              freelancer.address
          )
      ]);

      // Approve milestone
      block = chain.mineBlock([
          Tx.contractCall(
              'claritylance',
              'approve-milestone',
              [types.uint(1), types.uint(0)],
              client.address
          )
      ]);

      block.receipts[0].result.expectOk().expectBool(true);
      block.receipts[0].events.expectSTXTransferEvent(
          300,
          `${deployer.address}.claritylance`,
          freelancer.address
      );
  });

  it('should handle dispute resolution', () => {
      // Create and setup project first