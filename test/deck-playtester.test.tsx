import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { DeckPlaytester } from "../src/deck-playtester"
import { createPlaytestState } from "../src/engine"
import { initialSnapshot } from "../src/snapshot"
import type { PlaytestSnapshot } from "../src/types"

afterEach(cleanup)

const cards = Array.from({ length: 12 }, (_, index) => ({
  deckCardId: `deck-card-${index}`,
  id: `deck-card-${index}:0`,
  name: `Card ${index}`,
}))
const initialState = createPlaytestState(cards)

test("a controlled playtester reports changes and shows only the snapshot it is given", () => {
  const onSnapshotChange = vi.fn<(snapshot: PlaytestSnapshot) => void>()
  const snapshot = initialSnapshot(initialState)
  const { rerender } = render(
    <DeckPlaytester
      initialState={initialState}
      onSnapshotChange={onSnapshotChange}
      snapshot={snapshot}
      title="Test deck"
    />,
  )

  fireEvent.click(screen.getByRole("button", { name: /Keep 7/ }))

  expect(onSnapshotChange).toHaveBeenCalledTimes(1)
  const kept = onSnapshotChange.mock.calls[0][0]
  expect(kept).toMatchObject({ openingHand: false, state: snapshot.state })
  // The host hasn't accepted the change yet.
  expect(screen.getByRole("heading", { name: "Opening hand" })).toBeTruthy()

  rerender(
    <DeckPlaytester
      initialState={initialState}
      onSnapshotChange={onSnapshotChange}
      snapshot={kept}
      title="Test deck"
    />,
  )
  expect(screen.queryByRole("heading", { name: "Opening hand" })).toBeNull()

  fireEvent.click(screen.getByRole("button", { name: "Undo" }))
  expect(onSnapshotChange).toHaveBeenLastCalledWith(snapshot)
})

test("host-owned life and turn are shown and changed through the host", () => {
  const onLifeChange = vi.fn()
  const onTurnChange = vi.fn()
  const onSnapshotChange = vi.fn<(snapshot: PlaytestSnapshot) => void>()
  render(
    <DeckPlaytester
      initialState={initialState}
      life={{ onChange: onLifeChange, value: 27 }}
      onSnapshotChange={onSnapshotChange}
      playerCounters={null}
      snapshot={{ ...initialSnapshot(initialState), openingHand: false }}
      title="Test deck"
      turn={{ onChange: onTurnChange, value: 6 }}
    />,
  )

  expect(screen.getByRole("group", { name: "Life total" }).textContent).toContain("27")
  fireEvent.click(screen.getByRole("button", { name: "Gain 1 life" }))
  expect(onLifeChange).toHaveBeenCalledWith(28)

  fireEvent.click(screen.getByRole("button", { name: /Next turn/ }))
  expect(onTurnChange).toHaveBeenCalledWith(7)
  // The untap and draw still happen in the snapshot.
  expect(onSnapshotChange.mock.lastCall?.[0].state.hand).toHaveLength(8)
  expect(screen.queryByRole("button", { name: /Counters/ })).toBeNull()
})

test("hidden host values remove their controls", () => {
  render(<DeckPlaytester initialState={initialState} life={null} title="Test deck" turn={null} />)

  expect(screen.queryByRole("group", { name: "Life total" })).toBeNull()
  expect(screen.queryByRole("button", { name: /Next turn/ })).toBeNull()
})

test("canRestart={false} offers no way to restart the game", () => {
  render(<DeckPlaytester canRestart={false} initialState={initialState} title="Test deck" />)
  expect(screen.getByRole("heading", { name: "Opening hand" })).toBeTruthy()
  expect(screen.queryByRole("button", { name: /Restart/ })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: /Keep 7/ }))
  expect(screen.queryByRole("button", { name: "Restart game" })).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "More game actions" }))
  expect(screen.queryByRole("menuitem", { name: /Restart/ })).toBeNull()
})

test("a London mulligan puts the picked cards on the bottom when keeping", () => {
  window.localStorage.setItem("test:settings", JSON.stringify({ londonMulligan: true }))
  const onSnapshotChange = vi.fn<(snapshot: PlaytestSnapshot) => void>()
  render(
    <DeckPlaytester
      initialState={initialState}
      onSnapshotChange={onSnapshotChange}
      settingsKey="test:settings"
      title="Test deck"
    />,
  )

  // The first mulligan is free; the second redraws 7 and owes one card to the bottom.
  fireEvent.click(screen.getByRole("button", { name: /Mulligan/ }))
  expect(screen.getByRole("button", { name: /Keep 7/ })).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: /Mulligan/ }))
  const keep = screen.getByRole("button", { name: /Keep 6/ }) as HTMLButtonElement
  expect(keep.disabled).toBe(true)
  fireEvent.keyDown(window, { key: "Enter" })
  expect(screen.getByRole("heading", { name: "Opening hand" })).toBeTruthy()

  const dealt = onSnapshotChange.mock.lastCall![0].state
  expect(dealt.hand).toHaveLength(7)
  const bottom = dealt.hand[2]
  fireEvent.click(screen.getByRole("button", { name: `Put ${bottom.name} on the bottom` }))
  fireEvent.click(keep)

  const kept = onSnapshotChange.mock.lastCall![0]
  expect(kept.openingHand).toBe(false)
  expect(kept.state.hand.map((card) => card.id)).toEqual(
    dealt.hand.filter((card) => card.id !== bottom.id).map((card) => card.id),
  )
  expect(kept.state.library.at(-1)?.id).toBe(bottom.id)
  window.localStorage.removeItem("test:settings")
})
