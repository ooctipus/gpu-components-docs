import React, {useId, useState} from 'react';
import styles from './styles.module.css';

export default function ResetExample({scene = 'cartpole'}) {
  const [afterReset, setAfterReset] = useState(false);
  const rowsId = useId();
  const sceneNames = scene === 'franka' ? ['banana + Franka', 'banana + two Frankas'] : ['cartpole', 'G1'];
  const groups = [
    {sceneIndex: 0, worlds: afterReset ? ['A', 'C'] : ['A', 'B', 'C']},
    {sceneIndex: 1, worlds: afterReset ? ['D', 'B'] : ['D']},
  ];

  return (
    <figure className={styles.example}>
      <figcaption className={styles.caption}>
        <strong>B resets into a different prepared scene</strong>
        <span>Each world contains one complete scene.</span>
      </figcaption>

      <div className={styles.controls} role="group" aria-label="Choose reset stage">
        <button type="button" aria-pressed={!afterReset} aria-controls={rowsId}
          onClick={() => setAfterReset(false)}>
          Before reset
        </button>
        <button type="button" aria-pressed={afterReset} aria-controls={rowsId}
          onClick={() => setAfterReset(true)}>
          After reset
        </button>
      </div>

      <div className={styles.groups} id={rowsId}>
        {groups.map(({sceneIndex, worlds}) => (
          <section className={styles.group} key={sceneIndex} aria-label={`Scene ${sceneIndex}: ${sceneNames[sceneIndex]}`}>
            <div className={styles.groupHeading}>
              <strong>Scene {sceneIndex}</strong>
              <span>{worlds.length} {worlds.length === 1 ? 'world' : 'worlds'}</span>
            </div>
            <ol className={styles.rows}>
              {worlds.map((world, row) => (
                <li key={world} className={world === 'B' ? styles.resetWorld : undefined}>
                  <span className={styles.rowNumber}>Row {row}</span>
                  <strong>World {world}</strong>
                  <span className={styles.composition}>{sceneNames[sceneIndex]}</span>
                  {world === 'B' && (
                    <span className={styles.resetLabel}>{afterReset ? 'New episode' : 'Will reset'}</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">
        {afterReset
          ? `B now has the ${sceneNames[1]} scene. The groups have 2 worlds each. C moves from row 2 to row 1 and keeps its state.`
          : `Scene 0 has 3 worlds; scene 1 has 1. B will reset into the ${sceneNames[1]} scene.`}
      </p>
      <p className={styles.note}>
        Illustration: enough GPU memory is already available. Only live rows are shown; their placement can vary.
      </p>
    </figure>
  );
}
