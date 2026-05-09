import { ParsedRaceEvent } from "@/app/mega-secret-pits/types";
import Modal from "./Modal";

interface DeleteEventModalProps {
  isOpen: boolean;
  eventToDelete: ParsedRaceEvent | null;
  eventIndex: number;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteEventModal({
  isOpen,
  eventToDelete,
  eventIndex,
  onClose,
  onConfirm,
}: DeleteEventModalProps) {
  if (!eventToDelete) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-8">Удалить событие</h2>
        
        <div className="mb-8">
          <p className="text-lg text-gray-300 mb-6">Вы уверены, что хотите удалить это событие?</p>
          
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-6 mb-4">
            <div className="text-blue-300 text-sm mb-2">Событие #{eventIndex + 1}</div>
            
            {eventToDelete.type === "pit" && eventToDelete.team && eventToDelete.pitCount ? (
              <>
                <div className="text-xl font-bold text-white mb-2">
                  {eventToDelete.team.name}
                </div>
                <div className="text-lg text-blue-200 mb-3">
                  Пит #{eventToDelete.pitCount}
                </div>
                <div className="text-gray-300">
                  Карт <span className="font-mono bg-gray-700 px-2 py-1 rounded">
                    {eventToDelete.team.karts[eventToDelete.pitCount - 1]}
                  </span> → <span className="font-mono bg-gray-700 px-2 py-1 rounded">
                    {eventToDelete.team.karts[eventToDelete.pitCount]}
                  </span>
                </div>
              </>
            ) : eventToDelete.type === "add_kart" ? (
              <>
                <div className="text-xl font-bold text-white mb-2">
                  Добавление карта
                </div>
                <div className="text-lg text-green-200 mb-3">
                  Карт #{eventToDelete.kart.padStart(2, "0")}
                </div>
                <div className="text-gray-300">
                  Добавляется в питлейн {String.fromCharCode(65 + eventToDelete.lane)}
                  {eventToDelete.position !== undefined && eventToDelete.position !== -1 
                    ? ` на позицию ${eventToDelete.position + 1}` 
                    : " в конец"
                  }
                </div>
              </>
            ) : eventToDelete.type === "remove_kart" ? (
              <>
                <div className="text-xl font-bold text-white mb-2">
                  Удаление карта
                </div>
                <div className="text-lg text-gray-200 mb-3">
                  Карт #{eventToDelete.kart.padStart(2, "0")}
                </div>
                <div className="text-gray-300">
                  Удаляется из питлейна {String.fromCharCode(65 + eventToDelete.lane)}
                </div>
              </>
            ) : eventToDelete.type === "breakdown" && eventToDelete.newKart ? (
              <>
                <div className="text-xl font-bold text-white mb-2">
                  Поломка карта
                </div>
                <div className="text-lg text-orange-200 mb-3">
                  Карт #{eventToDelete.kart.padStart(2, "0")} → #{eventToDelete.newKart.padStart(2, "0")}
                </div>
                <div className="text-gray-300">
                  Поломка на треке (не в питлейне)
                </div>
              </>
            ) : (
              <div className="text-xl font-bold text-white mb-2">
                Неизвестный тип события
              </div>
            )}
          </div>
          
          <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-4">
            <p className="text-yellow-300">
              ⚠️ Это действие нельзя отменить и может повлиять на последующие события
            </p>
          </div>
        </div>
        
        <div className="flex gap-4 justify-center">
          <button
            onClick={onClose}
            className="px-8 py-3 text-gray-300 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors duration-200 min-w-[120px]"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 min-w-[120px]"
          >
            Удалить
          </button>
        </div>
      </div>
    </Modal>
  );
}
