import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getNotificationConfig,
  requestUnlockCode,
  verifyUnlockCode,
  saveCoreCredentials,
  sendNotificationNow,
} from "@/lib/notifications.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock, LockOpen, Plus, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Recipient = { id: string; kind: string; value: string; label: string | null; is_primary: boolean };
type Row = { value: string; label: string };

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const fetchConfig = useServerFn(getNotificationConfig);
  const askCode = useServerFn(requestUnlockCode);
  const checkCode = useServerFn(verifyUnlockCode);
  const saveCore = useServerFn(saveCoreCredentials);
  const sendNow = useServerFn(sendNotificationNow);

  const { data: config, isLoading } = useQuery({
    queryKey: ["notification-config"],
    queryFn: () => fetchConfig({}),
  });

  const [stage, setStage] = useState<"locked" | "code" | "unlocked">("locked");
  const [code, setCode] = useState("");
  const [verifiedCode, setVerifiedCode] = useState("");
  const [botToken, setBotToken] = useState("");
  const [telegram, setTelegram] = useState<Row[]>([]);
  const [emails, setEmails] = useState<Row[]>([]);
  const [adminEmails, setAdminEmails] = useState<Row[]>([]);

  const primary = (kind: string) =>
    ((config?.recipients ?? []) as Recipient[]).filter((r) => r.kind === kind && r.is_primary);
  const extra = (kind: string) =>
    ((config?.recipients ?? []) as Recipient[]).filter((r) => r.kind === kind && !r.is_primary);

  useEffect(() => {
    if (!config) return;
    setTelegram(primary("telegram").map((r) => ({ value: r.value, label: r.label ?? "" })));
    setEmails(primary("email").map((r) => ({ value: r.value, label: r.label ?? "" })));
    setAdminEmails(primary("admin_email").map((r) => ({ value: r.value, label: r.label ?? "" })));
    setBotToken("");
  }, [config]);

  const unlockRequest = useMutation({
    mutationFn: () => askCode({}),
    onSuccess: (res) => {
      setStage("code");
      if (res.emailDelivered) toast.success("Verification code emailed to the admin address.");
      else if (res.telegramFallback)
        toast.success("Email isn't configured yet — code sent to the primary Telegram chats.");
      else
        toast.error(
          "Could not deliver the code: set up an email sender domain or the Telegram bot token first.",
        );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verify = useMutation({
    mutationFn: () => checkCode({ data: { code: code.trim() } }),
    onSuccess: () => {
      setVerifiedCode(code.trim());
      setStage("unlocked");
      toast.success("Settings unlocked for editing.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () =>
      saveCore({
        data: {
          code: verifiedCode,
          telegramBotToken: botToken.trim() ? botToken.trim() : null,
          primaryTelegram: clean(telegram),
          primaryEmails: clean(emails),
          adminEmails: clean(adminEmails),
        },
      }),
    onSuccess: () => {
      toast.success("Core credentials saved.");
      setStage("locked");
      setCode("");
      setVerifiedCode("");
      queryClient.invalidateQueries({ queryKey: ["notification-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addExtra = useMutation({
    mutationFn: async ({ kind, value, label }: { kind: string; value: string; label: string }) => {
      const { error } = await supabase
        .from("notification_recipients")
        .insert({ kind, value, label: label || null, is_primary: false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact added.");
      queryClient.invalidateQueries({ queryKey: ["notification-config"] });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "That contact already exists." : e.message),
  });

  const removeExtra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notification_recipients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact removed.");
      queryClient.invalidateQueries({ queryKey: ["notification-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [testStatus, setTestStatus] = useState<string[]>([]);
  const test = useMutation({
    mutationFn: () => sendNow({}),
    onSuccess: (res) => {
      const lines = [
        res.alerts === 0
          ? "All vehicles up to date — sent as an all-clear message"
          : `${res.alerts} alert${res.alerts === 1 ? "" : "s"} in one message`,
        ...res.telegram.map((t: any) => `Telegram → ${t.to}: ${t.ok ? "delivered" : t.detail}`),
        ...res.email.map((t: any) => `Email → ${t.to}: ${t.ok ? "delivered" : t.detail}`),
      ];
      setTestStatus(lines);
      toast.success("Notification dispatched.");
    },

    onError: (e: Error) => {
      setTestStatus([`Failed: ${e.message}`]);
      toast.error(e.message);
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const locked = stage !== "unlocked";

  return (
    <div className="space-y-4">
      <Card className="border-primary/40">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                Core credentials
              </CardTitle>
              <CardDescription>Highly secure — email verification required to edit.</CardDescription>
            </div>
            <Badge variant={locked ? "secondary" : "default"}>{locked ? "Locked" : "Unlocked"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Telegram bot token</Label>
            {locked ? (
              <Input value={config?.botTokenSet ? "••••••••••••••••" : "Not set"} disabled />
            ) : (
              <Input
                placeholder={config?.botTokenSet ? `Current: ${config.botTokenMasked}` : "123456:ABC-DEF…"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
            )}
          </div>

          <CoreList
            title="Primary Telegram recipients (chat ID)"
            rows={telegram}
            setRows={setTelegram}
            locked={locked}
            maskedRows={primary("telegram")}
            placeholder="Chat ID"
          />
          <CoreList
            title="Primary email recipients"
            rows={emails}
            setRows={setEmails}
            locked={locked}
            maskedRows={primary("email")}
            placeholder="name@example.com"
          />
          <CoreList
            title="Admin email IDs (receive unlock codes)"
            rows={adminEmails}
            setRows={setAdminEmails}
            locked={locked}
            maskedRows={primary("admin_email")}
            placeholder="admin@example.com"
          />

          {stage === "locked" && (
            <Button
              className="w-full h-11"
              onClick={() => unlockRequest.mutate()}
              disabled={unlockRequest.isPending}
            >
              {unlockRequest.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Unlock settings
            </Button>
          )}

          {stage === "code" && (
            <div className="space-y-2">
              <Label htmlFor="otp">6-digit verification code</Label>
              <div className="flex gap-2">
                <Input
                  id="otp"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                />
                <Button
                  className="shrink-0"
                  disabled={code.length !== 6 || verify.isPending}
                  onClick={() => verify.mutate()}
                >
                  Verify
                </Button>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setStage("locked")}>
                Cancel
              </Button>
            </div>
          )}

          {stage === "unlocked" && (
            <div className="flex gap-2">
              <Button className="flex-1 h-11" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => {
                  setStage("locked");
                  setCode("");
                  setVerifiedCode("");
                  queryClient.invalidateQueries({ queryKey: ["notification-config"] });
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Additional contacts</CardTitle>
          <CardDescription>
            Extra Telegram chat IDs and emails. No verification needed to add or remove.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddContact onAdd={(kind, value, label) => addExtra.mutate({ kind, value, label })} />
          <ul className="space-y-2">
            {[...extra("telegram"), ...extra("email")].map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                <Badge variant="secondary" className="shrink-0">
                  {r.kind === "telegram" ? "Telegram" : "Email"}
                </Badge>
                <span className="truncate flex-1">
                  {r.value}
                  {r.label ? ` · ${r.label}` : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${r.value}`}
                  onClick={() => removeExtra.mutate(r.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
            {extra("telegram").length + extra("email").length === 0 && (
              <li className="text-sm text-muted-foreground">No additional contacts yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test delivery</CardTitle>
          <CardDescription>
            Sends the current compliance digest as one combined message to Telegram and email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full h-11" disabled={test.isPending} onClick={() => test.mutate()}>
            {test.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Notification
          </Button>
          {testStatus.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {testStatus.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function clean(rows: Row[]) {
  return rows
    .map((r) => ({ value: r.value.trim(), label: r.label.trim() || null }))
    .filter((r) => r.value.length > 0);
}

function CoreList({
  title,
  rows,
  setRows,
  locked,
  maskedRows,
  placeholder,
}: {
  title: string;
  rows: Row[];
  setRows: (r: Row[]) => void;
  locked: boolean;
  maskedRows: Recipient[];
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      {locked ? (
        <ul className="space-y-1">
          {maskedRows.length === 0 && <li className="text-sm text-muted-foreground">Not set</li>}
          {maskedRows.map((r) => (
            <li key={r.id} className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-mono">{mask(r.value)}</span>
              {r.label ? <span className="text-muted-foreground"> · {r.label}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={r.value}
                placeholder={placeholder}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                }
              />
              <Input
                value={r.label}
                placeholder="Name"
                className="w-28 shrink-0"
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Remove"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setRows([...rows, { value: "", label: "" }])}
          >
            <Plus className="h-4 w-4 mr-1" /> Add row
          </Button>
        </div>
      )}
    </div>
  );
}

function mask(v: string) {
  if (v.includes("@")) {
    const [name, domain] = v.split("@");
    return `${name.slice(0, 2)}••••@${domain}`;
  }
  return v.length <= 4 ? "••••" : `${v.slice(0, 2)}••••${v.slice(-2)}`;
}

function AddContact({
  onAdd,
}: {
  onAdd: (kind: string, value: string, label: string) => void;
}) {
  const [kind, setKind] = useState("telegram");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return toast.error("Enter a chat ID or email.");
    if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      return toast.error("Enter a valid email address.");
    if (kind === "telegram" && !/^-?\d{5,20}$/.test(v))
      return toast.error("Telegram chat ID must be numeric.");
    onAdd(kind, v, label.trim());
    setValue("");
    setLabel("");
  }

  return (
    <form className="space-y-2" onSubmit={submit}>
      <Select value={kind} onValueChange={setKind}>
        <SelectTrigger className="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="telegram">Telegram chat ID</SelectItem>
          <SelectItem value="email">Email address</SelectItem>
        </SelectContent>
      </Select>
      <Input
        placeholder={kind === "telegram" ? "123456789" : "name@example.com"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex gap-2">
        <Input placeholder="Name (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button type="submit" className="h-10 shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Add New
        </Button>
      </div>
    </form>
  );
}
