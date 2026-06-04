:::mermaid
flowchart TD
  subgraph triangle_10["triangle"]
    subgraph left_12["left"]
      left_1["left"]
    end
    subgraph right_14["right"]
      right_2["right"]
    end
  end

  left_1 --> right_2;

  classDef highlight fill:#FFFFAA,stroke:#333;
:::