import { useEffect, useMemo, useState } from 'react';
import { Dimensions } from 'react-native';
import {
  makeMutable,
  type SharedValue,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { INITIAL_CONTAINER_LAYOUT, INITIAL_LAYOUT_VALUE } from '../constants';
import type { ContainerLayoutState, LayoutState } from '../types';

const INITIAL_STATE: LayoutState = {
  window: Dimensions.get('window'),
  rawContainerHeight: INITIAL_LAYOUT_VALUE,
  containerHeight: INITIAL_LAYOUT_VALUE,
  containerOffset: INITIAL_CONTAINER_LAYOUT.offset,
  handleHeight: INITIAL_LAYOUT_VALUE,
  footerHeight: INITIAL_LAYOUT_VALUE,
  contentHeight: INITIAL_LAYOUT_VALUE,
};

/**
 * A custom hook that manages and animates the layout state of a container,
 * typically used in bottom sheet components. It calculates the effective
 * container height by considering top and bottom insets, and updates the
 * animated state in response to layout changes. The hook supports both modal
 * and non-modal modes, and ensures the container's animated layout state
 * remains in sync with the actual layout measurements.
 *
 * @param containerLayoutState - A shared value representing the current container layout state.
 * @param topInset - The top inset value to be subtracted from the container height.
 * @param bottomInset - The bottom inset value to be subtracted from the container height.
 * @param modal - Optional flag indicating if the layout is in modal mode.
 * @param shouldOverrideHandleHeight - Optional flag to override the handle height in the layout state, only when handle is set to null.
 * @returns An object containing the animated layout state.
 */
export function useAnimatedLayout(
  containerLayoutState: SharedValue<ContainerLayoutState> | undefined,
  topInset: number,
  bottomInset: number,
  modal?: boolean,
  shouldOverrideHandleHeight?: boolean
) {
  //#region  variables
  const verticalInset = useMemo(
    () => topInset + bottomInset,
    [topInset, bottomInset]
  );
  const initialState = useMemo(() => {
    const _state = { ...INITIAL_STATE };

    if (containerLayoutState) {
      const containerLayout = containerLayoutState.get();
      _state.containerHeight = modal
        ? containerLayout.height - verticalInset
        : containerLayout.height;
      _state.containerOffset = containerLayout.offset;
    }

    if (shouldOverrideHandleHeight) {
      _state.handleHeight = 0;
    }

    return _state;
  }, [containerLayoutState, modal, shouldOverrideHandleHeight, verticalInset]);
  //#endregion

  //#region state
  const [state] = useState(() => makeMutable(initialState));
  //#endregion

  //#region effects
  useAnimatedReaction(
    () => state.value.rawContainerHeight,
    (result, previous) => {
      if (result === previous) {
        return;
      }
      if (result === INITIAL_LAYOUT_VALUE) {
        return;
      }

      state.modify(_state => {
        'worklet';
        _state.containerHeight = modal ? result - verticalInset : result;
        return _state;
      });
    },
    [state, verticalInset, modal]
  );
  useAnimatedReaction(
    () => containerLayoutState?.get().height,
    (result, previous) => {
      if (!result || result === previous) {
        return;
      }
      if (result === INITIAL_LAYOUT_VALUE) {
        return;
      }

      state.modify(_state => {
        'worklet';
        _state.containerHeight = modal ? result - verticalInset : result;
        return _state;
      });
    },
    [state, verticalInset, modal]
  );
  // Workaround for gorhom/react-native-bottom-sheet#2690:
  // On Reanimated 4 the useAnimatedReaction above can miss the initial
  // INITIAL_LAYOUT_VALUE (-999) -> measured-height transition (race on mount,
  // e.g. when the screen container is recycled by react-native-screens on a
  // second navigation). When missed, containerHeight stays at the sentinel, the
  // detents never normalize and the sheet mounts off-screen / invisible.
  // We re-sync from rawContainerHeight on the JS thread after mount as a net.
  useEffect(() => {
    let frame: number | undefined;
    let attempts = 0;
    const trySync = () => {
      const current = state.value;
      if (current.containerHeight !== INITIAL_LAYOUT_VALUE) {
        return;
      }
      const raw = current.rawContainerHeight;
      const fromContainer = containerLayoutState?.get().height;
      const measured =
        raw != null && raw !== INITIAL_LAYOUT_VALUE ? raw : fromContainer;
      if (measured != null && measured !== INITIAL_LAYOUT_VALUE) {
        state.modify(_state => {
          'worklet';
          _state.containerHeight = modal ? measured - verticalInset : measured;
          return _state;
        });
        return;
      }
      if (attempts++ < 10) {
        frame = requestAnimationFrame(trySync);
      }
    };
    frame = requestAnimationFrame(trySync);
    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [state, containerLayoutState, modal, verticalInset]);

  useEffect(() => {
    Dimensions.addEventListener('change', ({ window }) => {
      state.modify(_state => {
        'worklet';
        _state.window = window;
        return _state;
      });
    });
  }, [state]);
  //#endregion

  return state;
}
