:::mermaid
flowchart TD
  subgraph level1_250["level1"]
    s1_248["s1"]
    s0_249["s0"]
    c0_251["c0"]
    c1_252["c1"]
    subgraph level0_252["level0"]
      x_250["x"]
    end
  end

  s1_248 --> x_250;
  s0_249 --> x_250;
  x_250 --> c0_251;
  x_250 --> c1_252;

  classDef highlight fill:#FFFFAA,stroke:#333;
:::