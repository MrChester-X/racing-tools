import { ParsedRaceTeam } from "@/app/mega-secret-pits/types";
import Modal from "./Modal";

interface DeleteTeamModalProps {
  isOpen: boolean;
  teamToDelete: ParsedRaceTeam | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteTeamModal({
  isOpen,
  teamToDelete,
  onClose,
  onConfirm,
}: DeleteTeamModalProps) {
  if (!teamToDelete) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-8">Удалить команду</h2>
        
        <div className="mb-8">
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-6">
            <p className="text-lg text-gray-300 mb-4">
              Вы уверены, что хотите удалить команду?
            </p>
            <div className="text-xl font-bold text-white mb-2">
              {teamToDelete.name}
            </div>
            <div className="text-yellow-300 text-sm">
              Стартовый карт: #{teamToDelete.startKart}
            </div>
            <div className="text-red-300 text-sm mt-4">
              ⚠️ Это действие нельзя отменить
            </div>
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
