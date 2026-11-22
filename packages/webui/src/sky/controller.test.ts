import { describe, expect, test } from "vitest"
import { SkyController, type SkyDeps } from "./controller"
import type { SkyContext } from "./engine"

/**
 * Doubles injectés : on pilote le worker, les rAF et l'horloge à la main.
 * Aucun DOM canvas réel n'est nécessaire pour prouver le handshake, le repli
 * et l'arrêt complet sur onglet masqué.
 */
type Harness = {
  deps: SkyDeps
  canvas: HTMLCanvasElement
  worker: FakeWorker
  frames: Map<number, FrameRequestCallback>
  nextFrame: number
  tick: (now: number) => void
  transferred: boolean
  drawn: number
}

class FakeWorker {
  messages: Array<{ type: string; [key: string]: unknown }> = []
  onmessage: ((event: MessageEvent<{ type: string }>) => void) | null = null
  onerror: (() => void) | null = null
  terminated = false
  postMessage(message: { type: string; [key: string]: unknown }): void {
    this.messages.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  emit(type: string): void {
    this.onmessage?.({ data: { type } } as MessageEvent<{ type: string }>)
  }
}

function fakeContext(): SkyContext {
  return {
    fillStyle: "",
    globalAlpha: 1,
    fillRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    setTransform: () => {},
  } as unknown as SkyContext
}

function harness(options: { transferThrows?: boolean; workerThrows?: boolean } = {}): Harness {
  const worker = new FakeWorker()
  const frames = new Map<number, FrameRequestCallback>()
  const canvas = {
    width: 0,
    height: 0,
    transferControlToOffscreen: () => {
      if (options.transferThrows) throw new Error("transfert impossible")
      return { getContext: () => fakeContext(), width: 0, height: 0, setTransform: () => {} }
    },
    getContext: () => fakeContext(),
  } as unknown as HTMLCanvasElement
  let now = 1000
  let nextFrame = 1
  const drawn = { value: 0 }
  const deps: SkyDeps = {
    raf: (callback) => {
      const id = nextFrame++
      frames.set(id, callback)
      return id
    },
    caf: (id) => void frames.delete(id),
    now: () => now,
    dpr: () => 1,
    createWorker: () => {
      if (options.workerThrows) throw new Error("worker indisponible")
      return worker as unknown as Worker
    },
    transfer: (target) => target.transferControlToOffscreen() as unknown as OffscreenCanvas,
    workerUrl: new URL("http://localhost/worker.js"),
    probeTimeoutMs: 50,
  }
  return {
    deps,
    canvas,
    worker,
    frames,
    get nextFrame() {
      return nextFrame
    },
    tick: (time: number) => {
      now = time
      const pending = [...frames.entries()]
      frames.clear()
      for (const [, callback] of pending) callback(time)
      drawn.value = pending.length
    },
    get transferred() {
      return worker.messages.some((message) => message.type === "init")
    },
    get drawn() {
      return drawn.value
    },
  }
}

describe("ciel — orchestration worker et repli", () => {
  test("handshake avant transfert : le worker reçoit le canvas et le niveau", () => {
    const h = harness()
    const controller = new SkyController(h.canvas, "on", h.deps)
    controller.start(1920, 1080)
    expect(h.worker.messages.map((m) => m.type)).toEqual(["probe"])
    expect(h.transferred).toBe(false)
    h.worker.emit("probe-ok")
    expect(controller.backendKind).toBe("worker")
    expect(h.transferred).toBe(true)
    const init = h.worker.messages.find((m) => m.type === "init")
    expect(init?.width).toBe(1920)
    expect(init?.height).toBe(1080)
    expect(init?.mode).toBe("on")
    expect(h.worker.messages.some((m) => m.type === "visibility")).toBe(true)
    controller.destroy()
  })

  test("changement de niveau et visibilité sont expédiés au worker", () => {
    const h = harness()
    const controller = new SkyController(h.canvas, "on", h.deps)
    controller.start(1280, 720)
    h.worker.emit("probe-ok")
    controller.setMode("static")
    controller.setHidden(true)
    expect(h.worker.messages).toContainEqual({ type: "mode", mode: "static" })
    expect(h.worker.messages).toContainEqual({ type: "visibility", hidden: true })
    controller.destroy()
    expect(h.worker.terminated).toBe(true)
    expect(h.worker.messages).toContainEqual({ type: "stop" })
  })

  test("repli si le worker ne peut pas être créé", () => {
    const h = harness({ workerThrows: true })
    const controller = new SkyController(h.canvas, "on", h.deps)
    controller.start(800, 600)
    expect(controller.backendKind).toBe("main")
    expect(h.frames.size).toBe(1)
    controller.destroy()
    expect(h.frames.size).toBe(0)
  })

  test("repli si le transfert échoue : le canvas reste utilisable", () => {
    const h = harness({ transferThrows: true })
    const controller = new SkyController(h.canvas, "on", h.deps)
    controller.start(800, 600)
    h.worker.emit("probe-ok")
    expect(controller.backendKind).toBe("main")
    expect(h.frames.size).toBe(1)
    controller.destroy()
  })

  test("arrêt complet sur onglet masqué, reprise sans image fantôme", () => {
    const h = harness({ workerThrows: true })
    const controller = new SkyController(h.canvas, "on", h.deps)
    controller.start(800, 600)
    h.tick(1016)
    expect(h.frames.size).toBe(1) // une nouvelle image a été demandée
    controller.setHidden(true)
    expect(h.frames.size).toBe(0) // plus aucune rAF en attente
    h.tick(1032)
    expect(h.frames.size).toBe(0)
    controller.setHidden(false)
    expect(h.frames.size).toBe(1)
    controller.destroy()
    expect(h.frames.size).toBe(0)
  })

  test("le niveau off n'abonne aucune image", () => {
    const h = harness({ workerThrows: true })
    const controller = new SkyController(h.canvas, "off", h.deps)
    controller.start(800, 600)
    expect(h.frames.size).toBe(0)
    controller.destroy()
  })

  test("le delta borné empêche tout saut après une longue pause", () => {
    const h = harness({ workerThrows: true })
    const controller = new SkyController(h.canvas, "on", h.deps)
    controller.start(800, 600)
    // Une pause de 10 s ne doit produire qu'un delta de 50 ms : la position
    // reste bornée, même si l'horloge a beaucoup avancé. `tick` vide la file
    // avant d'appeler le callback, comme le navigateur le ferait.
    h.tick(11000)
    expect(h.frames.size).toBe(1)
    controller.destroy()
  })
})
