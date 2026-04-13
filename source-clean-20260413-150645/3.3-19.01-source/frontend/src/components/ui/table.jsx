import { cn } from "../../lib/utils";

export function Table({ className, ...props }) {
  return (
    <div data-slot="table-container" className="cn-table-container relative w-full overflow-x-auto rounded-md border border-input">
      <table data-slot="table" className={cn("cn-table w-full min-w-[720px] caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }) {
  return <thead data-slot="table-header" className={cn("cn-table-header bg-muted/40 [&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }) {
  return <tbody data-slot="table-body" className={cn("cn-table-body [&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableFooter({ className, ...props }) {
  return <tfoot data-slot="table-footer" className={cn("cn-table-footer bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />;
}

export function TableRow({ className, ...props }) {
  return (
    <tr
      data-slot="table-row"
      className={cn("cn-table-row border-b border-input transition-colors hover:bg-muted/30 data-[state=selected]:bg-muted", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }) {
  return (
    <th
      data-slot="table-head"
      className={cn("cn-table-head text-muted-foreground h-10 px-3 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }) {
  return <td data-slot="table-cell" className={cn("cn-table-cell p-3 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />;
}

export function TableCaption({ className, ...props }) {
  return <caption data-slot="table-caption" className={cn("cn-table-caption text-muted-foreground mt-4 text-sm", className)} {...props} />;
}
