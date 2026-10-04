type Wall = {
  side: "front" | "right" | "back" | "left";
  upper: number;
  lower: ("window" | "door")[];
};

const WALLS: Wall[] = [
  { side: "front", upper: 3, lower: ["window", "door", "window"] },
  { side: "right", upper: 2, lower: ["window", "door"] },
  { side: "back", upper: 3, lower: ["window", "door", "window"] },
  { side: "left", upper: 2, lower: ["door", "window"] },
];

const CHIMNEY = ["front", "right", "back", "left"] as const;
const TREES = ["one", "two"] as const;

/** Slow-turning estate house: two storeys, one door per wall — one for each way into Nexora. */
export function MarketingHouse() {
  return (
    <div className="marketing-house-scene" aria-hidden>
      <div className="marketing-house-stage">
        <div className="marketing-house">
          <span className="marketing-house-lawn" />
          <span className="marketing-house-path" />

          {WALLS.map((wall) => (
            <span
              key={wall.side}
              className={`marketing-house-face marketing-house-wall marketing-house-wall-${wall.side}`}
            >
              <span className="marketing-house-storey marketing-house-storey-upper">
                {Array.from({ length: wall.upper }, (_, i) => (
                  <span key={i} className="marketing-house-window" />
                ))}
              </span>
              <span className="marketing-house-band" />
              <span className="marketing-house-storey marketing-house-storey-lower">
                {wall.lower.map((part, i) => (
                  <span
                    key={i}
                    className={part === "door" ? "marketing-house-door" : "marketing-house-window"}
                  />
                ))}
              </span>
              <span className="marketing-house-plinth" />
            </span>
          ))}

          <span className="marketing-house-face marketing-house-gable marketing-house-gable-right" />
          <span className="marketing-house-face marketing-house-gable marketing-house-gable-left" />
          <span className="marketing-house-face marketing-house-roof marketing-house-roof-front" />
          <span className="marketing-house-face marketing-house-roof marketing-house-roof-back" />

          {CHIMNEY.map((side) => (
            <span
              key={side}
              className={`marketing-house-face marketing-house-chimney marketing-house-chimney-${side}`}
            />
          ))}
          <span className="marketing-house-chimney-cap" />

          <span className="marketing-house-face marketing-house-canopy" />
          <span className="marketing-house-step-top" />
          <span className="marketing-house-face marketing-house-step-front" />

          {TREES.map((tree) => (
            <span key={tree} className={`marketing-house-tree marketing-house-tree-${tree}`}>
              <span className="marketing-house-tree-crown" />
              <span className="marketing-house-tree-crown marketing-house-tree-crown-cross" />
              <span className="marketing-house-tree-trunk" />
            </span>
          ))}

          <span className="marketing-house-sign-post" />
          <span className="marketing-house-sign marketing-house-sign-front">TO LET</span>
          <span className="marketing-house-sign marketing-house-sign-back">TO LET</span>
        </div>
      </div>
    </div>
  );
}
