import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Vehicle } from "@/lib/compliance";
import { DOC_FIELDS } from "@/lib/compliance";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vehicle?: Vehicle | null;
}

const empty = {
  license_plate: "",
  make_model: "",
  assigned_driver: "",
  insurance_expiry: "",
  fc_expiry: "",
  puc_expiry: "",
  road_tax_expiry: "",
  permit_expiry: "",
  rc_expiry: "",
};

export function VehicleForm({ open, onOpenChange, vehicle }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vehicle) {
      setForm({
        license_plate: vehicle.license_plate ?? "",
        make_model: vehicle.make_model ?? "",
        assigned_driver: vehicle.assigned_driver ?? "",
        insurance_expiry: vehicle.insurance_expiry ?? "",
        fc_expiry: vehicle.fc_expiry ?? "",
        puc_expiry: vehicle.puc_expiry ?? "",
        road_tax_expiry: vehicle.road_tax_expiry ?? "",
        permit_expiry: vehicle.permit_expiry ?? "",
        rc_expiry: vehicle.rc_expiry ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [vehicle, open]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    const payload = {
      license_plate: form.license_plate.trim().toUpperCase(),
      make_model: form.make_model.trim(),
      assigned_driver: form.assigned_driver.trim() || null,
      insurance_expiry: form.insurance_expiry || null,
      fc_expiry: form.fc_expiry || null,
      puc_expiry: form.puc_expiry || null,
      road_tax_expiry: form.road_tax_expiry || null,
      permit_expiry: form.permit_expiry || null,
      rc_expiry: form.rc_expiry || null,
    };
    let error;
    if (vehicle) {
      ({ error } = await supabase.from("vehicles").update(payload).eq("id", vehicle.id));
    } else {
      const { data: userRes } = await supabase.auth.getUser();
      ({ error } = await supabase
        .from("vehicles")
        .insert({ ...payload, created_by: userRes.user?.id ?? null }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(vehicle ? "Vehicle updated" : "Vehicle added");
    qc.invalidateQueries({ queryKey: ["vehicles"] });
    qc.invalidateQueries({ queryKey: ["vehicle", vehicle?.id] });
    qc.invalidateQueries({ queryKey: ["alerts"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label htmlFor="lp">License plate</Label>
            <Input
              id="lp"
              placeholder="TN-01-AB-1234"
              value={form.license_plate}
              onChange={(e) => set("license_plate", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="mm">Make & Model</Label>
            <Input
              id="mm"
              placeholder="Tata Ace Gold"
              value={form.make_model}
              onChange={(e) => set("make_model", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dr">Assigned driver</Label>
            <Input
              id="dr"
              placeholder="Ramesh Kumar"
              value={form.assigned_driver}
              onChange={(e) => set("assigned_driver", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {DOC_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <Label htmlFor={key} className="text-xs">{label}</Label>
                <Input
                  id={key}
                  type="date"
                  value={form[key] as string}
                  onChange={(e) => set(key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form.license_plate || !form.make_model}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
