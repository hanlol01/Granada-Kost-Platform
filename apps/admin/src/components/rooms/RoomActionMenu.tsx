// Dropdown action menu for each room row. Actions: View, Edit, Ubah Status,
// Nonaktifkan / Aktifkan Kembali.

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RoomRecord, RoomStatus } from "@/hooks/useRooms";
import { Eye, MoreHorizontal, Pencil, Power, PowerOff, RefreshCw } from "lucide-react";

export type RoomActionMenuProps = {
  room: RoomRecord;
  onView: (room: RoomRecord) => void;
  onEdit: (room: RoomRecord) => void;
  onStatusChange: (room: RoomRecord) => void;
  onArchive: (room: RoomRecord) => void;
};

export function RoomActionMenu({
  room,
  onView,
  onEdit,
  onStatusChange,
  onArchive,
}: RoomActionMenuProps) {
  const isInactive = room.roomStatus === "inactive";

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onView(room)}
        title="Lihat detail"
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={() => onEdit(room)}
        title="Edit kamar"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Aksi lainnya">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => onStatusChange(room)}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Ubah Status
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isInactive ? (
            <DropdownMenuItem onClick={() => onArchive(room)}>
              <Power className="mr-2 h-3.5 w-3.5 text-success" />
              <span className="text-success">Aktifkan Kembali</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => onArchive(room)}>
              <PowerOff className="mr-2 h-3.5 w-3.5 text-destructive" />
              <span className="text-destructive">Nonaktifkan</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
