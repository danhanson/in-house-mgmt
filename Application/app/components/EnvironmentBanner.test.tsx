import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "../../test-utils/render";
import EnvironmentBanner from "./EnvironmentBanner";

describe("EnvironmentBanner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the staging banner when NEXT_PUBLIC_ENVIRONMENT is staging", () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "staging");
    render(<EnvironmentBanner />);
    expect(screen.getByRole("status", { name: /staging environment/i })).toBeInTheDocument();
  });

  it("renders the dev banner when NEXT_PUBLIC_ENVIRONMENT is dev", () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "dev");
    render(<EnvironmentBanner />);
    expect(screen.getByRole("status", { name: /dev environment/i })).toBeInTheDocument();
  });

  it("renders nothing in production", () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "production");
    render(<EnvironmentBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing when the env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "");
    render(<EnvironmentBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
