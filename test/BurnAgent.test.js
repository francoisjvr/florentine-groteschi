import { expect } from "chai";
import { AGENT_BURN_SELECTOR, encodeAgentBurn } from "../agents/burn-agent/src/abi.js";
import { buildPostBurnTweet, buildPreBurnTweet, makeOAuth1Header } from "../agents/burn-agent/src/twitter.js";

describe("burn agent helpers", function () {
  it("encodes the existing agentBurnFromCollection call", function () {
    const calldata = encodeAgentBurn(42);
    expect(calldata).to.match(/^0x[0-9a-f]+$/);
    expect(calldata.slice(0, 10)).to.equal(AGENT_BURN_SELECTOR);
    expect(calldata).to.have.length(10 + 64);
  });

  it("rejects invalid token ids", function () {
    expect(() => encodeAgentBurn(0)).to.throw("positive integer");
    expect(() => encodeAgentBurn(-1)).to.throw("positive integer");
  });

  it("keeps burn announcement tweets inside the tweet length limit", function () {
    const reason = "x".repeat(500);
    expect(buildPreBurnTweet({ collectionName: "Florentine Brainrot", tokenId: 1, reason })).to.have.length.lte(280);
    expect(buildPostBurnTweet({ collectionName: "Florentine Brainrot", tokenId: 1, reason, txHash: "0x" + "a".repeat(64), chainId: 1 })).to.have.length.lte(280);
  });

  it("builds an OAuth 1.0a authorization header for Twitter posting", function () {
    const header = makeOAuth1Header({
      method: "POST",
      url: "https://api.twitter.com/2/tweets",
      apiKey: "key",
      apiSecret: "secret",
      accessToken: "token",
      accessTokenSecret: "token-secret",
      nonce: "nonce",
      timestamp: 123
    });
    expect(header).to.include("OAuth ");
    expect(header).to.include('oauth_consumer_key="key"');
    expect(header).to.include('oauth_token="token"');
    expect(header).to.include("oauth_signature=");
  });
});
