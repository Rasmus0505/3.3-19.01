import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "../../lib/utils";

export function Calendar({ className, classNames, showOutsideDays = true, ...props }) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col gap-3 sm:flex-row sm:gap-4",
        month: "space-y-3",
        month_caption: "relative flex items-center justify-center pt-1",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous:
          "cn-button cn-button-variant-outline cn-button-size-icon-sm absolute left-1 size-7 bg-transparent p-0 opacity-70 hover:opacity-100",
        button_next:
          "cn-button cn-button-variant-outline cn-button-size-icon-sm absolute right-1 size-7 bg-transparent p-0 opacity-70 hover:opacity-100",
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "w-9 rounded-md text-[0.8rem] font-normal text-muted-foreground",
        weeks: "mt-2 flex flex-col gap-1",
        week: "flex w-full",
        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day_button:
          "cn-button cn-button-variant-ghost cn-button-size-icon-sm h-9 w-9 p-0 font-normal aria-selected:opacity-100",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-muted text-foreground",
        outside: "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", chevronClassName)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn("size-4", chevronClassName)} {...chevronProps} />
          ),
      }}
      {...props}
    />
  );
}

