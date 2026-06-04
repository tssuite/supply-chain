```mermaid
flowchart TD
  subgraph level1_152["level1"]
    c0_146["c0"]
    c1_147["c1"]
    subgraph level0_154["level0"]
      x_145["x"]
    end
  end

  x_145 --> c0_146;
  x_145 --> c1_147;

  classDef highlight fill:#FFFFAA,stroke:#333;
```