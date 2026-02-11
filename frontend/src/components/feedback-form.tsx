"use client";

import { useState, useCallback, useEffect } from "react";
import { keccak256, stringToHex } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getChainName, getExplorerUrl } from "@/lib/chains";
import { shortenHex, formatTimestamp } from "@/lib/format";
import {
  connectWallet,
  switchChain,
  sendTransaction,
  onAccountsChanged,
  onChainChanged,
} from "@/lib/wallet";
import { kya } from "@/lib/kya";
import type { AgentIdentity, FeedbackChain, FeedbackComment } from "@registrai/kya";

const PRESET_TAGS = [
  "reliability",
  "accuracy",
  "speed",
  "helpfulness",
  "safety",
];

interface FeedbackFormProps {
  agentId: string;
  identities: AgentIdentity[];
}

function getScoreLabel(score: number): string {
  if (score <= -75) return "Terrible";
  if (score <= -25) return "Poor";
  if (score < 25) return "Neutral";
  if (score < 75) return "Good";
  return "Excellent";
}

function getScoreColor(score: number): string {
  if (score <= -25) return "text-red-500";
  if (score < 25) return "text-yellow-500";
  return "text-green-500";
}

export function FeedbackForm({ agentId, identities }: FeedbackFormProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [feedbackChains, setFeedbackChains] = useState<FeedbackChain[]>([]);
  const [selectedChain, setSelectedChain] = useState<FeedbackChain | null>(null);
  const [score, setScore] = useState(50);
  const [tag, setTag] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  // Fetch feedback chains from SDK
  useEffect(() => {
    kya.getFeedbackChains(agentId)
      .then((res) => {
        setFeedbackChains(res.chains);
        if (res.chains.length > 0) {
          setSelectedChain(res.chains[0]);
        }
      })
      .catch(() => {
        // Fallback: build from identities
        const chains: FeedbackChain[] = identities.map((id) => ({
          chainId: id.chainId,
          chainName: id.chainName,
          reputationRegistry: "",
          agentId: id.l2AgentId,
          globalAgentId: id.globalAgentId,
        }));
        setFeedbackChains(chains);
        if (chains.length > 0) setSelectedChain(chains[0]);
      });
  }, [agentId, identities]);

  // Fetch existing comments
  const fetchComments = useCallback(() => {
    setCommentsLoading(true);
    setCommentsError(null);
    kya.getFeedback(agentId)
      .then((data) => {
        setComments(data.comments);
        setCommentsLoading(false);
      })
      .catch((err) => {
        setCommentsError(err instanceof Error ? err.message : "Failed to load feedback");
        setCommentsLoading(false);
      });
  }, [agentId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments, txHash]);

  // Wallet event listeners
  useEffect(() => {
    if (!walletAddress) return;
    const removeAccounts = onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        setWalletAddress(null);
        setWalletChainId(null);
      } else {
        setWalletAddress(accounts[0]);
      }
    });
    const removeChain = onChainChanged((chainId) => {
      setWalletChainId(chainId);
    });
    return () => {
      removeAccounts();
      removeChain();
    };
  }, [walletAddress]);

  const handleConnect = useCallback(async () => {
    try {
      setError(null);
      const { address, chainId } = await connectWallet();
      setWalletAddress(address);
      setWalletChainId(chainId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect wallet"
      );
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    setWalletAddress(null);
    setWalletChainId(null);
    setTxHash(null);
    setError(null);
  }, []);

  const handleTagClick = useCallback(
    (presetTag: string) => {
      setTag(tag === presetTag ? "" : presetTag);
    },
    [tag]
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedChain || !walletAddress) return;

    setIsSubmitting(true);
    setError(null);
    setTxHash(null);

    try {
      const commentHash = comment.trim()
        ? keccak256(stringToHex(comment.trim()))
        : undefined;

      // 1. Switch chain if needed
      if (walletChainId !== selectedChain.chainId) {
        await switchChain(selectedChain.chainId);
        setWalletChainId(selectedChain.chainId);
      }

      // 2. Build tx via SDK
      const txData = await kya.buildFeedbackTx(agentId, {
        chainId: selectedChain.chainId,
        value: String(score),
        valueDecimals: 0,
        tag1: tag || undefined,
        feedbackHash: commentHash,
      });

      // 3. Send on-chain tx
      const hash = await sendTransaction({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        chainId: txData.chainId,
      });

      setTxHash(hash);

      // 4. Store comment via SDK
      try {
        await kya.submitFeedback(agentId, {
          chainId: selectedChain.chainId,
          commenterAddress: walletAddress,
          score,
          tag,
          comment: comment.trim(),
          commentHash:
            commentHash ||
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          txHash: hash,
        });
      } catch (apiErr) {
        setError(
          `On-chain tx sent, but failed to store comment: ${apiErr instanceof Error ? apiErr.message : "Unknown error"}`
        );
      }

      setComment("");
      setScore(50);
      setTag("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      if (msg.includes("User rejected") || msg.includes("user rejected")) {
        setError("Transaction rejected");
      } else {
        setError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedChain, walletAddress, walletChainId, score, tag, comment, agentId]);

  if (feedbackChains.length === 0 && identities.length === 0) return null;

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-muted-foreground">
        Leave Feedback
      </h3>

      {!walletAddress ? (
        <Button onClick={handleConnect} variant="outline" className="w-full">
          Connect Wallet to Leave Feedback
        </Button>
      ) : (
        <div className="space-y-4">
          {/* Connected wallet */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-mono">
                {shortenHex(walletAddress)}
              </span>
              {walletChainId && (
                <Badge variant="outline" className="text-xs">
                  {getChainName(walletChainId)}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>

          {/* Chain selector */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Submit on chain</p>
            <div className="flex flex-wrap gap-2">
              {feedbackChains.map((chain) => (
                <Badge
                  key={chain.chainId}
                  variant={
                    selectedChain?.chainId === chain.chainId
                      ? "default"
                      : "outline"
                  }
                  className="cursor-pointer"
                  onClick={() => setSelectedChain(chain)}
                >
                  {chain.chainName}
                </Badge>
              ))}
            </div>
          </div>

          {/* Score slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Score</p>
              <span
                className={`text-sm font-semibold ${getScoreColor(score)}`}
              >
                {score > 0 ? "+" : ""}
                {score} — {getScoreLabel(score)}
              </span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={score}
              onChange={(e) => setScore(parseInt(e.target.value))}
              className="w-full accent-primary h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-100 Terrible</span>
              <span>0 Neutral</span>
              <span>+100 Excellent</span>
            </div>
          </div>

          {/* Tag chips */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Tag (optional)</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_TAGS.map((presetTag) => (
                <Badge
                  key={presetTag}
                  variant={tag === presetTag ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => handleTagClick(presetTag)}
                >
                  {presetTag}
                </Badge>
              ))}
            </div>
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="or type a custom tag"
              className="mt-1.5"
            />
          </div>

          {/* Comment textarea */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Comment (optional — hash stored on-chain)
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              placeholder="Describe your experience with this agent..."
              rows={3}
              className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {comment.length}/500
            </p>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedChain}
            className="w-full"
          >
            {isSubmitting ? "Confirming in wallet..." : "Submit Feedback"}
          </Button>

          {/* Success */}
          {txHash && selectedChain && (
            <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 space-y-1">
              <p className="text-sm text-green-700 dark:text-green-400">
                Feedback submitted on-chain!
              </p>
              <a
                href={`${getExplorerUrl(selectedChain.chainId)}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-primary hover:underline"
              >
                View transaction: {shortenHex(txHash, 8)}
              </a>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Existing comments */}
      <Separator />
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">
          Recent Feedback
          {!commentsLoading && !commentsError && ` (${comments.length})`}
        </h3>

        {commentsLoading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading feedback...
          </div>
        )}

        {commentsError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 space-y-2">
            <p className="text-sm text-destructive">{commentsError}</p>
            <Button variant="outline" size="sm" onClick={fetchComments}>
              Retry
            </Button>
          </div>
        )}

        {!commentsLoading && !commentsError && comments.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            No feedback yet. Be the first to leave a review!
          </p>
        )}

        {!commentsLoading &&
          comments.map((c) => (
            <div
              key={c.id}
              className="rounded-md border px-3 py-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold font-mono ${getScoreColor(c.score)}`}
                  >
                    {c.score > 0 ? "+" : ""}
                    {c.score}
                  </span>
                  {c.tag && (
                    <Badge variant="outline" className="text-xs">
                      {c.tag}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {c.chainName}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(c.createdAt)}
                </span>
              </div>
              {c.comment && (
                <p className="text-sm text-foreground">{c.comment}</p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">
                  {shortenHex(c.commenterAddress)}
                </span>
                {c.txHash && (
                  <a
                    href={`${getExplorerUrl(c.chainId)}/tx/${c.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    tx
                  </a>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
