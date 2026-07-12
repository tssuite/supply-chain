:::mermaid
flowchart TD
  subgraph butterFly_136["butterFly"]
    subgraph level3_137["level3"]
      s111_273["s111"]
      c111_287["c111"]
      subgraph level2_138["level2"]
        s11_274["s11"]
        s10_275["s10"]
        s01_276["s01"]
        s00_277["s00"]
        c00_283["c00"]
        c01_284["c01"]
        c10_285["c10"]
        c11_286["c11"]
        subgraph level1_139["level1"]
          s1_278["s1"]
          s0_279["s0"]
          c0_281["c0"]
          c1_282["c1"]
          subgraph level0_140["level0"]
            x_280["x"]
          end
        end
      end
    end
  end

  s111_273 --> s11_274;
  s11_274 --> s1_278;
  s10_275 --> s1_278;
  s01_276 --> s0_279;
  s00_277 --> s0_279;
  c11_286 --> c111_287;
  s1_278 --> x_280;
  s0_279 --> x_280;
  c0_281 --> c00_283;
  c0_281 --> c01_284;
  c1_282 --> c10_285;
  c1_282 --> c11_286;
  x_280 --> c0_281;
  x_280 --> c1_282;

  classDef highlight fill:#FFFFAA,stroke:#333;
:::