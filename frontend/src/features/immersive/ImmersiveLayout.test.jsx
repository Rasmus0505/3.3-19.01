import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ImmersiveLayout from "./ImmersiveLayout";

describe("ImmersiveLayout", () => {
  it("keeps the right workbench visible in standard mode", () => {
    render(
      <ImmersiveLayout
        leftTopContent={<div>video</div>}
        leftBottomContent={<div>typing</div>}
        rightTopContent={<div>explanation</div>}
        rightBottomContent={<div>chat</div>}
      />,
    );

    expect(screen.getByLabelText("视频与拼写工作区")).toBeTruthy();
    expect(screen.getByLabelText("讲解与题目工作区")).toBeTruthy();
  });

  it("hides the right workbench in fullscreen study mode", () => {
    render(
      <ImmersiveLayout
        fullscreenStudyMode
        leftTopContent={<div>video</div>}
        leftBottomContent={<div>typing</div>}
        rightTopContent={<div>explanation</div>}
        rightBottomContent={<div>chat</div>}
      />,
    );

    expect(screen.getByLabelText("全屏视频与拼写工作区")).toBeTruthy();
    expect(screen.queryByLabelText("讲解与题目工作区")).toBeNull();
    expect(screen.queryByText("explanation")).toBeNull();
    expect(screen.queryByText("chat")).toBeNull();
  });
});
