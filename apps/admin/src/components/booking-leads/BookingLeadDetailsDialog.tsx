import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BOOKING_LEAD_CATEGORY_LABEL,
  BOOKING_LEAD_GENDER_LABEL,
  BOOKING_LEAD_SOURCE_LABEL,
  BOOKING_LEAD_STATUS_LABEL,
  type BookingLeadRecord,
} from "@/hooks/useBookingLeads";
import { formatDate } from "@/lib/format";

type Props = {
  lead: BookingLeadRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value || "Belum tersedia"}</dd>
    </div>
  );
}

export function BookingLeadDetailsDialog({ lead, open, onOpenChange }: Props) {
  if (!lead) return null;
  const roomTarget = lead.roomNumber
    ? [lead.roomNumber, lead.buildingCode, lead.floorCode ? `Lantai ${lead.floorCode}` : null]
        .filter(Boolean)
        .join(" · ")
    : "Belum dipilih";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detail calon penyewa</DialogTitle>
          <DialogDescription>
            Minat ini belum menjadi reservasi, penyewaan, occupancy, atau tagihan.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Detail label="Calon Penyewa" value={lead.visitorName} />
          <Detail label="Nomor WhatsApp" value={lead.visitorPhone} />
          <Detail label="Kategori Kost" value={BOOKING_LEAD_CATEGORY_LABEL[lead.category]} />
          <Detail label="Jenis Kelamin" value={BOOKING_LEAD_GENDER_LABEL[lead.gender]} />
          <Detail label="Universitas/Pendidikan" value={lead.visitorUniversity} />
          <Detail label="Sumber" value={BOOKING_LEAD_SOURCE_LABEL[lead.source]} />
          <Detail label="Kamar/Target" value={roomTarget} />
          <Detail
            label="Rencana Masuk"
            value={lead.preferredMoveInDate ? formatDate(lead.preferredMoveInDate) : null}
          />
          <Detail label="Status" value={BOOKING_LEAD_STATUS_LABEL[lead.status]} />
          <Detail label="Dicatat" value={formatDate(lead.createdAt)} />
          <div className="sm:col-span-2">
            <Detail label="Alamat" value={lead.visitorAddress} />
          </div>
          <div className="sm:col-span-2">
            <Detail label="Catatan calon penyewa" value={lead.visitorMessage} />
          </div>
        </dl>

        <DialogFooter>
          <Button className="min-h-11" variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
